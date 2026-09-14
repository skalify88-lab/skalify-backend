import { defineFunction, secret } from '@aws-amplify/backend';

export const initCoolPayPayout = defineFunction({
  name: 'init-coolpay-payout',
  entry: './handler.ts',
  resourceGroupName: 'data',
  timeoutSeconds: 30,
  environment: {
    MYCOOLPAY_PUBLIC_KEY: secret('MYCOOLPAY_PUBLIC_KEY'),
    MYCOOLPAY_PRIVATE_KEY: secret('MYCOOLPAY_PRIVATE_KEY'),
  },
});