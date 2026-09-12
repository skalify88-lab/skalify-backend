import { defineFunction, secret } from '@aws-amplify/backend';

export const coolPayWebhook = defineFunction({
  name: 'coolpay-webhook',
  entry: './handler.ts',
  resourceGroupName: 'data',
  environment: {
      MYCOOLPAY_PRIVATE_KEY: secret('MYCOOLPAY_PRIVATE_KEY'),
    },
});