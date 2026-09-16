import { defineFunction, secret } from '@aws-amplify/backend';

export const adminGetCoolPayBalance = defineFunction({
  name: 'admin-get-coolpay-balance',
  entry: './handler.ts',
  resourceGroupName: 'data',
  environment: {
    MYCOOLPAY_PUBLIC_KEY: secret('MYCOOLPAY_PUBLIC_KEY'),
    MYCOOLPAY_PRIVATE_KEY: secret('MYCOOLPAY_PRIVATE_KEY'),
  },
});