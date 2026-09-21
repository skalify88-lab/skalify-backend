import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { aws_s3 as s3, aws_iam as iam, aws_lambda as lambda } from 'aws-cdk-lib';
import { FunctionUrlAuthType } from 'aws-cdk-lib/aws-lambda';
import { initKpayPayment } from './functions/init-kpay-payment/resource';
import { kpayWebhook } from './functions/kpay-webhook/resource';
import { initCoolPayPayment } from './functions/init-coolpay-payment/resource';
import { coolPayWebhook } from './functions/coolpay-webhook/resource';
import { initCoolPayPayout } from './functions/init-coolpay-payout/resource';
import { checkCoolPayPayoutStatus } from './functions/check-coolpay-payout-status/resource';
import { adminBlockUser } from './functions/admin-block-user/resource';
import { adminSetMaintenanceMode } from './functions/admin-set-maintenance-mode/resource';
import { adminGetCoolPayBalance } from './functions/admin-get-coolpay-balance/resource';
import { adminSearchUsers } from './functions/admin-search-users/resource';
import { finalizeOrder } from './functions/finalize-order/resource';
import { adminWithdrawPlatformBalance } from './functions/admin-withdraw-platform-balance/resource';




const backend = defineBackend({
  auth,
  data,
  storage,
  initKpayPayment,
  kpayWebhook,
  initCoolPayPayment,
  coolPayWebhook,
  initCoolPayPayout,
  checkCoolPayPayoutStatus,
  adminBlockUser,
  adminSetMaintenanceMode,
  adminGetCoolPayBalance,
  adminSearchUsers,
  finalizeOrder,
  adminWithdrawPlatformBalance,
});




// Accès public en lecture pour les images d'articles
const bucket = backend.storage.resources.bucket;

// --- K-PAY ---
const paymentIntentTable = backend.data.resources.tables['PaymentIntent'];
const balanceTable = backend.data.resources.tables['Balance'];
const transactionTable = backend.data.resources.tables['Transaction'];
const kpayWebhookLambda = backend.kpayWebhook.resources.lambda as lambda.Function;

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
const coolPayIntentTable = backend.data.resources.tables['CoolPayIntent'];
const balanceTable2 = backend.data.resources.tables['Balance'];
const transactionTable2 = backend.data.resources.tables['Transaction'];
const coolPayWebhookLambda = backend.coolPayWebhook.resources.lambda as lambda.Function;

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

// ---- Retrait CoolPay ----
const coolPayPayoutIntentTable = backend.data.resources.tables['CoolPayPayoutIntent'];
coolPayPayoutIntentTable.grantReadWriteData(coolPayWebhookLambda);
coolPayWebhookLambda.addEnvironment('COOLPAY_PAYOUT_INTENT_TABLE_NAME', coolPayPayoutIntentTable.tableName);


// Autoriser explicitement l'accès public par politique (nécessaire en plus du bucket policy)
const cfnBucket = bucket.node.defaultChild as s3.CfnBucket;
cfnBucket.publicAccessBlockConfiguration = {
  blockPublicAcls: true,
  blockPublicPolicy: false,
  ignorePublicAcls: true,
  restrictPublicBuckets: false,
};


const userProfileTable = backend.data.resources.tables['UserProfile'];
const appConfigTable = backend.data.resources.tables['AppConfig'];
const userPoolId = backend.auth.resources.userPool.userPoolId;
const userPoolClientId = backend.auth.resources.userPoolClient.userPoolClientId;

const adminBlockUserLambda = backend.adminBlockUser.resources.lambda as lambda.Function;
userProfileTable.grantReadWriteData(adminBlockUserLambda);
adminBlockUserLambda.addEnvironment('USER_PROFILE_TABLE_NAME', userProfileTable.tableName);
adminBlockUserLambda.addEnvironment('COGNITO_USER_POOL_ID', userPoolId);
adminBlockUserLambda.addEnvironment('COGNITO_CLIENT_ID', userPoolClientId);
const adminBlockUserUrl = adminBlockUserLambda.addFunctionUrl({ authType: FunctionUrlAuthType.NONE });

const adminSetMaintenanceModeLambda = backend.adminSetMaintenanceMode.resources.lambda as lambda.Function;
userProfileTable.grantReadWriteData(adminSetMaintenanceModeLambda);
appConfigTable.grantReadWriteData(adminSetMaintenanceModeLambda);
adminSetMaintenanceModeLambda.addEnvironment('USER_PROFILE_TABLE_NAME', userProfileTable.tableName);
adminSetMaintenanceModeLambda.addEnvironment('APP_CONFIG_TABLE_NAME', appConfigTable.tableName);
adminSetMaintenanceModeLambda.addEnvironment('COGNITO_USER_POOL_ID', userPoolId);
adminSetMaintenanceModeLambda.addEnvironment('COGNITO_CLIENT_ID', userPoolClientId);
const adminSetMaintenanceModeUrl = adminSetMaintenanceModeLambda.addFunctionUrl({ authType: FunctionUrlAuthType.NONE });

const adminGetCoolPayBalanceLambda = backend.adminGetCoolPayBalance.resources.lambda as lambda.Function;
userProfileTable.grantReadWriteData(adminGetCoolPayBalanceLambda);
adminGetCoolPayBalanceLambda.addEnvironment('USER_PROFILE_TABLE_NAME', userProfileTable.tableName);
adminGetCoolPayBalanceLambda.addEnvironment('COGNITO_USER_POOL_ID', userPoolId);
adminGetCoolPayBalanceLambda.addEnvironment('COGNITO_CLIENT_ID', userPoolClientId);
const adminGetCoolPayBalanceUrl = adminGetCoolPayBalanceLambda.addFunctionUrl({ authType: FunctionUrlAuthType.NONE });


const adminSearchUsersLambda = backend.adminSearchUsers.resources.lambda as lambda.Function;
userProfileTable.grantReadData(adminSearchUsersLambda); // NOUVEAU : lecture seule suffit
adminSearchUsersLambda.addEnvironment('USER_PROFILE_TABLE_NAME', userProfileTable.tableName);
adminSearchUsersLambda.addEnvironment('COGNITO_USER_POOL_ID', userPoolId);
adminSearchUsersLambda.addEnvironment('COGNITO_CLIENT_ID', userPoolClientId);
const adminSearchUsersUrl = adminSearchUsersLambda.addFunctionUrl({ authType: FunctionUrlAuthType.NONE });



const adminWithdrawLambda = backend.adminWithdrawPlatformBalance.resources.lambda as lambda.Function;
userProfileTable.grantReadData(adminWithdrawLambda);
platformBalanceTable.grantReadWriteData(adminWithdrawLambda);
platformTransactionTable.grantReadWriteData(adminWithdrawLambda);
adminWithdrawLambda.addEnvironment('USER_PROFILE_TABLE_NAME', userProfileTable.tableName);
adminWithdrawLambda.addEnvironment('PLATFORM_BALANCE_TABLE_NAME', platformBalanceTable.tableName);
adminWithdrawLambda.addEnvironment('PLATFORM_TRANSACTION_TABLE_NAME', platformTransactionTable.tableName);
adminWithdrawLambda.addEnvironment('COGNITO_USER_POOL_ID', userPoolId);
adminWithdrawLambda.addEnvironment('COGNITO_CLIENT_ID', userPoolClientId);
const adminWithdrawUrl = adminWithdrawLambda.addFunctionUrl({ authType: FunctionUrlAuthType.NONE });



const platformBalanceTable = backend.data.resources.tables['PlatformBalance'];
const platformTransactionTable = backend.data.resources.tables['PlatformTransaction'];

// Ajoute aux deux webhooks existants (kpay et coolpay)
platformBalanceTable.grantReadWriteData(kpayWebhookLambda);
platformTransactionTable.grantReadWriteData(kpayWebhookLambda);
kpayWebhookLambda.addEnvironment('PLATFORM_BALANCE_TABLE_NAME', platformBalanceTable.tableName);
kpayWebhookLambda.addEnvironment('PLATFORM_TRANSACTION_TABLE_NAME', platformTransactionTable.tableName);

platformBalanceTable.grantReadWriteData(coolPayWebhookLambda);
platformTransactionTable.grantReadWriteData(coolPayWebhookLambda);
coolPayWebhookLambda.addEnvironment('PLATFORM_BALANCE_TABLE_NAME', platformBalanceTable.tableName);
coolPayWebhookLambda.addEnvironment('PLATFORM_TRANSACTION_TABLE_NAME', platformTransactionTable.tableName);


// Finalisation de la commande

const orderTable = backend.data.resources.tables['Order'];
const finalizeOrderLambda = backend.finalizeOrder.resources.lambda as lambda.Function;

orderTable.grantReadWriteData(finalizeOrderLambda);
balanceTable.grantReadWriteData(finalizeOrderLambda);
transactionTable.grantReadWriteData(finalizeOrderLambda);
platformBalanceTable.grantReadWriteData(finalizeOrderLambda);
platformTransactionTable.grantReadWriteData(finalizeOrderLambda);
userProfileTable.grantReadData(finalizeOrderLambda);

finalizeOrderLambda.addEnvironment('ORDER_TABLE_NAME', orderTable.tableName);
finalizeOrderLambda.addEnvironment('BALANCE_TABLE_NAME', balanceTable.tableName);
finalizeOrderLambda.addEnvironment('TRANSACTION_TABLE_NAME', transactionTable.tableName);
finalizeOrderLambda.addEnvironment('PLATFORM_BALANCE_TABLE_NAME', platformBalanceTable.tableName);
finalizeOrderLambda.addEnvironment('PLATFORM_TRANSACTION_TABLE_NAME', platformTransactionTable.tableName);
finalizeOrderLambda.addEnvironment('USER_PROFILE_TABLE_NAME', userProfileTable.tableName);
finalizeOrderLambda.addEnvironment('COGNITO_USER_POOL_ID', userPoolId);
finalizeOrderLambda.addEnvironment('COGNITO_CLIENT_ID', userPoolClientId);

const finalizeOrderUrl = finalizeOrderLambda.addFunctionUrl({ authType: FunctionUrlAuthType.NONE });





backend.addOutput({
  custom: {
    kpayWebhookUrl: webhookUrl.url,
    coolPayWebhookUrl: coolPayWebhookUrl.url,
    adminBlockUserUrl: adminBlockUserUrl.url,
    adminSetMaintenanceModeUrl: adminSetMaintenanceModeUrl.url,
    adminGetCoolPayBalanceUrl: adminGetCoolPayBalanceUrl.url,
    adminSearchUsersUrl: adminSearchUsersUrl.url,
    finalizeOrderUrl: finalizeOrderUrl.url,
    adminWithdrawPlatformBalanceUrl: adminWithdrawUrl.url,
  },
});











