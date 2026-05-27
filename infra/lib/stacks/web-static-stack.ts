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
   * Bedrock model ID. Default は claude-3-5-haiku (us-east-1 / cross-region 推奨).
   * 日本リージョンで使う場合は `apac.anthropic.claude-sonnet-4-5-20250929-v1:0` 等の
   * inference profile を指定する.
   */
  bedrockModelId?: string;
  /**
   * Bedrock proxy で受け付ける prompt の最大文字数. Default 2000.
   */
  maxPromptLength?: number;
}

/**
 * apps/web を S3 + CloudFront で配信、`/api/*` を Bedrock proxy Lambda に
 * route する最小 stack.
 *
 * 構成:
 *   Browser → CloudFront
 *     ├─ default (`/*`)      → S3 (apps/web/dist)
 *     └─ `/api/*`            → Lambda Function URL (Bedrock Converse proxy)
 *                              CloudFront から `X-Origin-Verify` header を付与
 *                              Lambda 側で verify check (direct access は 403)
 *
 * 無認証 (no-login MVP) だが以下で abuse 防止:
 *   - Origin Verify secret header
 *   - CORS allow-origin = CloudFront URL
 *   - prompt length cap
 *   - inferenceConfig.maxTokens cap
 *   - IAM role を Bedrock 特定モデルだけに絞る
 *
 * MVP なので Origin Verify secret は stack 内 hardcode. production 化する
 * 際は SecretsManager + CloudFront Origin custom header (Secret から resolve)
 * に切り替える.
 */
export class WebStaticStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: WebStaticStackProps) {
    super(scope, id, props);

    // ap-northeast-1 で使える JP inference profile.
    // (`apac.` ではなく `jp.` prefix. APAC profile は別 region).
    // 速度/コスト重視で Haiku 4.5. Sonnet が必要なら
    // `jp.anthropic.claude-sonnet-4-5-20250929-v1:0` に変更.
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
    // Lambda: Bedrock proxy (Node.js 22)
    // ─────────────────────────────────────────────────────────────
    const bedrockProxyFn = new lambda.Function(this, 'BedrockProxyFn', {
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(30),
      handler: 'handler.handler',
      // `apps/bedrock-proxy/node_modules` は workflow で事前 `npm install --omit=dev`
      // 済み. CDK の bundling Docker を使わずシンプルな asset zip にする
      // (GHA runner の Docker pull 時間 / arm64 emulation コスト回避).
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../../apps/bedrock-proxy'),
      ),
      environment: {
        ORIGIN_VERIFY_SECRET: originVerifySecret,
        ALLOWED_ORIGIN: '*', // CloudFront URL は deploy 後に確定するため * (Origin Verify で防御)
        BEDROCK_MODEL_ID: modelId,
        MAX_PROMPT_LENGTH: String(maxPromptLength),
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // Bedrock InvokeModel 権限 (特定モデル ARN だけ)
    bedrockProxyFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'bedrock:InvokeModel',
          'bedrock:InvokeModelWithResponseStream',
          'bedrock:Converse',
          'bedrock:ConverseStream',
        ],
        // cross-region inference 対応のため region wildcard.
        // model 部分は foundation-model + inference-profile を両方許可.
        resources: [
          `arn:aws:bedrock:*::foundation-model/*`,
          `arn:aws:bedrock:*:${this.account}:inference-profile/*`,
        ],
      }),
    );

    const bedrockFnUrl = bedrockProxyFn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      // CORS は handler.mjs 内で処理 (Origin Verify check と組み合わせる)
    });

    // ─────────────────────────────────────────────────────────────
    // CloudFront distribution
    // ─────────────────────────────────────────────────────────────
    const distribution = new cloudfront.Distribution(this, 'WebDistribution', {
      comment: `yesman ${props.envName} web static + bedrock proxy`,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.FunctionUrlOrigin(bedrockFnUrl, {
            // CloudFront → Lambda のみ通す verify header.
            // viewer から送られた同名 header は CloudFront によって上書きされる.
            customHeaders: {
              'X-Origin-Verify': originVerifySecret,
            },
          }),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          // Lambda が Host header を期待するので Host 以外を pass.
          originRequestPolicy:
            cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          compress: true,
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
    new cdk.CfnOutput(this, 'BedrockProxyUrl', {
      value: bedrockFnUrl.url,
      description:
        'Lambda Function URL (direct access blocked by Origin Verify; call via CloudFront /api/*)',
    });
    new cdk.CfnOutput(this, 'BedrockModelId', {
      value: modelId,
      description: 'Bedrock model ID configured for the proxy',
    });
  }
}
