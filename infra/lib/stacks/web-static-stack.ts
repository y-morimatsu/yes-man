import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export interface WebStaticStackProps extends cdk.StackProps {
  envName: string;
  /**
   * Bedrock model ID. Default は JP inference profile (Claude Haiku 4.5).
   */
  bedrockModelId?: string;
  /**
   * Bedrock proxy で受け付ける prompt の最大文字数. Default 2000.
   * (FastAPI 側でも別途 prompt サイズ制限あり)
   */
  maxPromptLength?: number;
}

/**
 * apps/web を S3 + CloudFront で配信、`/api/*` を FastAPI Lambda に route する stack.
 *
 * 構成 (2026-05-27 update — FastAPI 統合):
 *   Browser → CloudFront
 *     ├─ default (`/*`)      → S3 (apps/web/dist)
 *     └─ `/api/*`            → Lambda Function URL (FastAPI on Lambda Web Adapter)
 *                              CloudFront Function で `/api` prefix を strip
 *                              `X-Origin-Verify` header で direct access 防御
 *
 * FastAPI 機能:
 *   - /v1/health
 *   - /v1/decisions (SSE 含む)
 *   - /v1/persona-pool/*
 *   - /v1/scores/*
 *   - /v1/profiles/*
 *   - /v1/personas/*
 *   - /v1/preferences/*
 *
 * LLM: Bedrock (litellm 経由). model は `bedrockModelId` で指定.
 * Storage: mock (in-memory; Lambda warm container 内で保持).
 * Auth: mock + MOCK_AUTO_USER=true (全 request が固定 demo user で処理).
 *
 * 旧 BedrockProxyFn (apps/bedrock-proxy) は撤去. FastAPI 内の bedrock_adapter が
 * 直接 Bedrock を呼ぶため、別 proxy Lambda は不要.
 */
export class WebStaticStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: WebStaticStackProps) {
    super(scope, id, props);

    // ap-northeast-1 で使える JP inference profile (Claude Haiku 4.5).
    const modelId =
      props.bedrockModelId ??
      'jp.anthropic.claude-haiku-4-5-20251001-v1:0';
    const maxPromptLength = props.maxPromptLength ?? 2000;

    // MVP: hardcoded secret. production では SecretsManager で管理する.
    const originVerifySecret = `yesman-${props.envName}-origin-verify-2026-05-27`;

    // ─────────────────────────────────────────────────────────────
    // S3 bucket for apps/web/dist
    // ─────────────────────────────────────────────────────────────
    const bucket = new s3.Bucket(this, 'WebBucket', {
      bucketName: `yesman-${props.envName}-web-static-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ─────────────────────────────────────────────────────────────
    // Lambda: FastAPI on Lambda Web Adapter (Python 3.12, ARM64)
    //
    // Lambda Web Adapter (LWA) layer を attach することで、handler を `run.sh`
    // に指定するだけで uvicorn が起動し、Lambda invoke → HTTP request に
    // 変換されて FastAPI が処理する.
    //
    // SSE 対応のため Function URL の invokeMode を RESPONSE_STREAM に設定.
    // ─────────────────────────────────────────────────────────────

    // LWA Layer (ap-northeast-1, ARM64, v0.9.x).
    // https://github.com/awslabs/aws-lambda-web-adapter/releases
    // 数字 (v25) は public layer version. 上書き不可なので安定.
    const lwaLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      'LwaLayer',
      'arn:aws:lambda:ap-northeast-1:753240598075:layer:LambdaAdapterLayerArm64:25',
    );

    const fastApiFn = new lambda.Function(this, 'FastApiFn', {
      runtime: lambda.Runtime.PYTHON_3_12,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 1024,
      // SSE で長く繋ぐので timeout は長め (Lambda max 900s).
      // CloudFront 側 origin response timeout は別途 60s なので、実質 60s が cap.
      timeout: cdk.Duration.seconds(60),
      handler: 'run.sh',
      // CDK Docker bundling: apps/api を Python 3.12 ARM64 環境で pip install
      // して /asset-output に site-packages 込みで配置する.
      // pyproject.toml に [tool.setuptools.packages.find] where=["src"] が
      // 設定済なので、`pip install /asset-input` で yesman_api package +
      // 全依存が target に展開される.
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../../apps/api'),
        {
          exclude: [
            '.venv',
            '.pytest_cache',
            '__pycache__',
            '**/__pycache__',
            '**/*.pyc',
            'tests',
            'scripts',
            '.coverage',
            '.mypy_cache',
            '.ruff_cache',
            'alembic',
            'uv.lock',
            '.python-version',
            'Dockerfile*',
            '.lambda-build',
          ],
          bundling: {
            image: lambda.Runtime.PYTHON_3_12.bundlingImage,
            platform: 'linux/arm64',
            command: [
              'bash',
              '-c',
              [
                // 1. yesman_api package + deps を /asset-output に install
                'pip install --no-cache-dir --target /asset-output /asset-input',
                // 2. Lambda handler 用 run.sh を /asset-output 直下に配置
                'cp /asset-input/run.sh /asset-output/run.sh',
                'chmod +x /asset-output/run.sh',
              ].join(' && '),
            ],
          },
        },
      ),
      layers: [lwaLayer],
      environment: {
        // LWA bootstrap 起動
        AWS_LAMBDA_EXEC_WRAPPER: '/opt/bootstrap',
        // LWA が listen する port (run.sh の PORT と一致)
        PORT: '8080',
        // pip install --target=/asset-output で yesman_api + deps が /var/task/
        // 直下に展開される. Lambda runtime は default で /var/task を sys.path に
        // 含めるが、明示しておく.
        PYTHONPATH: '/var/task',

        // ─── yesman AppConfig env ───
        APP_ENV: 'dev',
        LOG_LEVEL: 'INFO',
        APP_VERSION: 'aws-prod',

        // Backend mode (DB なし / Cognito なし / Bedrock LLM)
        STORAGE_BACKEND: 'mock',
        AUTH_BACKEND: 'mock',
        LLM_PROVIDER: 'bedrock',
        VOICE_BACKEND: 'mock',
        EVENT_BACKEND: 'sync',
        LEARNING_CONSUMER_ENABLED: 'false',

        // Bedrock 設定
        BEDROCK_REGION: 'ap-northeast-1',
        BEDROCK_MODEL_ID: modelId,

        // Mock auth (全 request を固定 demo user で扱う)
        MOCK_AUTO_USER: 'true',
        MOCK_USER_SUB: '11111111-1111-1111-1111-111111111111',
        MOCK_USER_EMAIL: 'demo@yesman.app',
        MOCK_SEED_DEMO_DECISIONS: 'true',

        // Salts (production では SecretsManager)
        SILENCE_HASH_SALT: 'aws-prod-silence-salt-' + props.envName,
        PERSONA_ANONYMIZER_SALT: 'aws-prod-persona-salt-' + props.envName,

        // CORS (CloudFront URL は deploy 後確定するため * で開け、
        // Origin Verify header で実質 CloudFront のみに絞る)
        CORS_ALLOWED_ORIGINS: '["*"]',

        // Origin verify (CloudFront 経由限定)
        ORIGIN_VERIFY_SECRET: originVerifySecret,

        // FastAPI が CloudFront 配下 (path prefix /api) で動くこと用. ただし
        // CloudFront Function で /api を strip して Lambda に転送するので、
        // FastAPI 側からは / route として処理される. root_path は OpenAPI URL
        // 生成用の補助.
        FASTAPI_ROOT_PATH: '/api',
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // Bedrock 呼出権限
    fastApiFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
          'bedrock:Converse',
          'bedrock:ConverseStream',
        ],
        resources: [
          `arn:aws:bedrock:*::foundation-model/*`,
          `arn:aws:bedrock:*:${this.account}:inference-profile/*`,
          `arn:aws:bedrock:*:${this.account}:application-inference-profile/*`,
        ],
      }),
    );

    // Function URL — SSE 対応のため RESPONSE_STREAM mode
    const fastApiFnUrl = fastApiFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
    });

    // ─────────────────────────────────────────────────────────────
    // CloudFront Function — `/api/*` の path を strip して Lambda に転送.
    //   例: /api/v1/decisions → /v1/decisions
    // ─────────────────────────────────────────────────────────────
    const apiPathRewriteFn = new cloudfront.Function(this, 'ApiPathRewriteFn', {
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  // /api/foo → /foo (FastAPI 側は /v1/* で route 定義しているため strip 必須)
  if (uri.indexOf('/api/') === 0) {
    request.uri = uri.substring(4) || '/';
  } else if (uri === '/api') {
    request.uri = '/';
  }
  return request;
}
      `),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    // ─────────────────────────────────────────────────────────────
    // CloudFront distribution
    // ─────────────────────────────────────────────────────────────
    const distribution = new cloudfront.Distribution(this, 'WebDistribution', {
      comment: `yesman ${props.envName} web static + FastAPI Lambda`,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.FunctionUrlOrigin(fastApiFnUrl, {
            // CloudFront → Lambda のみ通す verify header.
            customHeaders: {
              'X-Origin-Verify': originVerifySecret,
            },
          }),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          // POST body や custom headers を Lambda に転送 (Host header は除く)
          originRequestPolicy:
            cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          // SSE は compress すると buffering される可能性があるため off.
          compress: false,
          functionAssociations: [
            {
              function: apiPathRewriteFn,
              eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            },
          ],
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(1),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.minutes(1),
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
    });

    // ─────────────────────────────────────────────────────────────
    // Web build を S3 にアップロード
    // ─────────────────────────────────────────────────────────────
    new s3deploy.BucketDeployment(this, 'WebDeploy', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../../apps/web/dist'))],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ['/*'],
    });

    // ─────────────────────────────────────────────────────────────
    // Outputs
    // ─────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront distribution URL (open this in browser)',
    });
    new cdk.CfnOutput(this, 'WebBucketName', {
      value: bucket.bucketName,
      description: 'S3 bucket hosting the web build',
    });
    new cdk.CfnOutput(this, 'FastApiFnUrl', {
      value: fastApiFnUrl.url,
      description:
        'FastAPI Lambda Function URL (direct access blocked by Origin Verify; call via CloudFront /api/*)',
    });
    new cdk.CfnOutput(this, 'BedrockModelId', {
      value: modelId,
      description: 'Bedrock model ID used by FastAPI LLM provider',
    });
    new cdk.CfnOutput(this, 'MaxPromptLength', {
      value: String(maxPromptLength),
      description: 'FYI: max prompt length cap (FastAPI 側で別途検証)',
    });
  }
}
