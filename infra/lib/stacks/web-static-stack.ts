import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';

export interface WebStaticStackProps extends cdk.StackProps {
  envName: string;
}

/**
 * apps/web を S3 + CloudFront で配信する最小 stack.
 *
 * - 他 stack に依存しない (auth/api/data 等不要)
 * - apps/web/dist をそのまま BucketDeployment で upload
 * - SPA fallback (404/403 → index.html) を CloudFront error response で実現
 * - backend (api / cognito) は apps/web の env をそのまま使う (= localhost:8000 default)
 *
 * 動作確認: CloudFront URL アクセスで SPA が描画されることを確認するのが目的.
 * backend を必要とする画面 (ログインなど) は機能しないが、splash/static UI は表示される.
 */
export class WebStaticStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: WebStaticStackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, 'WebBucket', {
      bucketName: `yesman-${props.envName}-web-static-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distribution = new cloudfront.Distribution(this, 'WebDistribution', {
      comment: `yesman ${props.envName} web static (CloudFront + S3 minimal)`,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
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

    new s3deploy.BucketDeployment(this, 'WebDeploy', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../../apps/web/dist'))],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ['/*'],
    });

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront distribution URL (open this in browser)',
    });
    new cdk.CfnOutput(this, 'WebBucketName', {
      value: bucket.bucketName,
      description: 'S3 bucket hosting the web build',
    });
  }
}
