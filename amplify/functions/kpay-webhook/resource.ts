import { defineFunction, secret } from '@aws-amplify/backend';

export const kpayWebhook = defineFunction({
  name: 'kpay-webhook',
  entry: './handler.ts',
  environment: {
    KPAY_WEBHOOK_SECRET: secret('KPAY_WEBHOOK_SECRET'),
  },
});