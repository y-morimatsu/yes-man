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

    // 2026-05-27: ap-northeast-1 の Google Gemma 3 12B IT を採用.
    //   - 新規 account でも RPM=1000 / TPM=100M が default (制限緩い)
    //   - Latency 200ms 前後で Haiku 並 (むしろ速い)
    //   - On-demand 直接呼出 (cross-region profile 不要、subscription 不要)
    // 旧 Haiku 4.5 (jp.anthropic.claude-haiku-4-5-20251001-v1:0) は
    // cross-region RPM が new account default 50 で SSE drill-down に不足、
    // AWS Support 経由の quota raise 待ちが必要だった.
    const modelId =
      props.bedrockModelId ??
      'google.gemma-3-12b-it';
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
    // Lambda: FastAPI on Lambda Web Adapter (Container Image, Python 3.12 ARM64)
    //
    // zip deploy では 250 MiB unzipped 上限を超えるため container image 方式.
    // Dockerfile (apps/api/Dockerfile) で:
    //   - python:3.12 base
    //   - LWA を /opt/extensions/lambda-adapter に COPY (extension として attach)
    //   - pip install で全 deps を install (litellm + sqlalchemy 等含む)
    //   - run.sh を CMD として起動
    // CDK が apps/api/Dockerfile を build → ECR push → Lambda が pull.
    //
    // SSE 対応のため Function URL の invokeMode を RESPONSE_STREAM に設定.
    // ─────────────────────────────────────────────────────────────

    const fastApiFn = new lambda.DockerImageFunction(this, 'FastApiFn', {
      // 2026-05-27: account 同時実行クォータ 10 (新規 account default) を緩和する
      // ための応急策として memory を 2048 に bump (CPU が memory に比例).
      // SSE / Bedrock 呼出が早く完了 → Lambda slot を早く開放 → throttle 軽減.
      memorySize: 2048,
      // SSE で長く繋ぐので timeout は長め. CloudFront origin response timeout
      // 60s が cap になるため 60s に合わせる.
      timeout: cdk.Duration.seconds(60),
      architecture: lambda.Architecture.ARM_64,
      code: lambda.DockerImageCode.fromImageAsset(
        path.join(__dirname, '../../../apps/api'),
        {
          platform: cdk.aws_ecr_assets.Platform.LINUX_ARM64,
          // Docker build context から除外 (asset hash 安定 + image 軽量化)
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
            '.lambda-build',
          ],
        },
      ),
      environment: {
        // LWA は Dockerfile で /opt/extensions/lambda-adapter として配置済.
        // extension は自動 load されるため AWS_LAMBDA_EXEC_WRAPPER 不要.

        // LWA が listen する port (Dockerfile ENV + run.sh の PORT と一致)
        PORT: '8080',

        // Function URL の invokeMode=RESPONSE_STREAM と LWA mode を合わせる.
        // Default は BUFFERED で、その場合 Lambda Function URL のレスポンス envelope
        // (statusCode/headers/body) がそのまま CloudFront 経由でブラウザに届いてしまう.
        // response_stream に切替えると LWA が HTTP response をそのまま stream で返す.
        AWS_LWA_INVOKE_MODE: 'response_stream',

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

        // 2026-05-27: Bedrock RPM quota 50 (new account) を緩和するため
        // SilenceGuard の LLM 自己判定 (1 call/req) を skip. regex で
        // 主要ドメインは catch、paraphrased 入力は素通り (hackathon 許容).
        SILENCE_GUARD_LLM_ENABLED: 'false',

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
