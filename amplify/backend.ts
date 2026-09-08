import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { aws_s3 as s3, aws_iam as iam } from 'aws-cdk-lib';
import { initCoolPayPayment } from './functions/init-coolpay-payment/resource';
import { coolPayWebhook } from './functions/coolpay-webhook/resource';


const backend = defineBackend({
  auth,
  data,
  storage,
  initKpayPayment,
  initCoolPayPayment,
  coolPayWebhook,
});


// Accès public en lecture pour les images d'articles
const bucket = backend.storage.resources.bucket;
const coolPayIntentTable = backend.data.resources.tables['CoolPayIntent'];
const balanceTable2 = backend.data.resources.tables['Balance']; // déjà référencée pour kpayWebhook, réutilise si possible
const transactionTable2 = backend.data.resources.tables['Transaction'];

coolPayIntentTable.grantReadWriteData(backend.coolPayWebhook.resources.lambda);
balanceTable2.grantReadWriteData(backend.coolPayWebhook.resources.lambda);
transactionTable2.grantReadWriteData(backend.coolPayWebhook.resources.lambda);

backend.coolPayWebhook.resources.lambda.addEnvironment('COOLPAY_INTENT_TABLE_NAME', coolPayIntentTable.tableName);
backend.coolPayWebhook.resources.lambda.addEnvironment('BALANCE_TABLE_NAME', balanceTable2.tableName);
backend.coolPayWebhook.resources.lambda.addEnvironment('TRANSACTION_TABLE_NAME', transactionTable2.tableName);

const coolPayWebhookUrl = backend.coolPayWebhook.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});



bucket.addToResourcePolicy(
  new iam.PolicyStatement({
    sid: 'PublicReadArticleImages',
    effect: iam.Effect.ALLOW,
    principals: [new iam.AnyPrincipal()],
    actions: ['s3:GetObject'],
    resources: [`${bucket.bucketArn}/articles/*`],
  })
);

backend.addOutput({
  custom: {
    kpayWebhookUrl: webhookUrl.url, // déjà existant
    coolPayWebhookUrl: coolPayWebhookUrl.url, // NOUVEAU
  },
});


// Autoriser explicitement l'accès public par politique (nécessaire en plus du bucket policy)
const cfnBucket = bucket.node.defaultChild as s3.CfnBucket;
cfnBucket.publicAccessBlockConfiguration = {
  blockPublicAcls: true,
  blockPublicPolicy: false,
  ignorePublicAcls: true,
  restrictPublicBuckets: false,
};

