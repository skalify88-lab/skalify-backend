import { defineFunction, secret } from '@aws-amplify/backend';

export const initCoolPayPayment = defineFunction({
  name: 'init-coolpay-payment',
  entry: './handler.ts',
  resourceGroupName: 'data',
  timeoutSeconds: 30,
  environment: {
    MYCOOLPAY_PUBLIC_KEY: secret('MYCOOLPAY_PUBLIC_KEY'),
    MYCOOLPAY_PRIVATE_KEY: secret('MYCOOLPAY_PRIVATE_KEY'),
  },
});