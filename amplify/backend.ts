import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { aws_s3 as s3, aws_iam as iam } from 'aws-cdk-lib';
import { FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda';
import { initKpayPayment } from './functions/init-kpay-payment/resource';
import { kpayWebhook } from './functions/kpay-webhook/resource';
import { initCoolPayPayment } from './functions/init-coolpay-payment/resource';
import { coolPayWebhook } from './functions/coolpay-webhook/resource';
import { aws_lambda as lambda } from 'aws-cdk-lib';


const backend = defineBackend({
  auth,
  data,
  storage,
  initKpayPayment,
  kpayWebhook,
  initCoolPayPayment,
  coolPayWebhook,
});

// Accès public en lecture pour les images d'articles
const bucket = backend.storage.resources.bucket;




// --- K-PAY ---
const kpayWebhookLambda = backend.kpayWebhook.resources.lambda as lambda.Function; // NOUVEAU

paymentIntentTable.grantReadWriteData(kpayWebhookLambda);
balanceTable.grantReadWriteData(kpayWebhookLambda);
transactionTable.grantReadWriteData(kpayWebhookLambda);

kpayWebhookLambda.addEnvironment('PAYMENT_INTENT_TABLE_NAME', paymentIntentTable.tableName);
kpayWebhookLambda.addEnvironment('BALANCE_TABLE_NAME', balanceTable.tableName);
kpayWebhookLambda.addEnvironment('TRANSACTION_TABLE_NAME', transactionTable.tableName);

const webhookUrl = kpayWebhookLambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
});

// --- My-CoolPay ---
const coolPayWebhookLambda = backend.coolPayWebhook.resources.lambda as lambda.Function; // NOUVEAU

coolPayIntentTable.grantReadWriteData(coolPayWebhookLambda);
balanceTable2.grantReadWriteData(coolPayWebhookLambda);
transactionTable2.grantReadWriteData(coolPayWebhookLambda);

coolPayWebhookLambda.addEnvironment('COOLPAY_INTENT_TABLE_NAME', coolPayIntentTable.tableName);
coolPayWebhookLambda.addEnvironment('BALANCE_TABLE_NAME', balanceTable2.tableName);
coolPayWebhookLambda.addEnvironment('TRANSACTION_TABLE_NAME', transactionTable2.tableName);

const coolPayWebhookUrl = coolPayWebhookLambda.addFunctionUrl({
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
    kpayWebhookUrl: webhookUrl.url,
    coolPayWebhookUrl: coolPayWebhookUrl.url,
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