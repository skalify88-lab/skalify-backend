import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { aws_s3 as s3, aws_iam as iam } from 'aws-cdk-lib';

const backend = defineBackend({
  auth,
  data,
  storage,
});

// Accès public en lecture pour les images d'articles
const bucket = backend.storage.resources.bucket;

bucket.addToResourcePolicy(
  new iam.PolicyStatement({
    sid: 'PublicReadArticleImages',
    effect: iam.Effect.ALLOW,
    principals: [new iam.AnyPrincipal()],
    actions: ['s3:GetObject'],
    resources: [`${bucket.bucketArn}/articles/*`],
  })
);

// Autoriser explicitement l'accès public par politique (nécessaire en plus du bucket policy)
const cfnBucket = bucket.node.defaultChild as s3.CfnBucket;
cfnBucket.publicAccessBlockConfiguration = {
  blockPublicAcls: true,
  blockPublicPolicy: false,
  ignorePublicAcls: true,
  restrictPublicBuckets: false,
};