import { defineFunction, secret } from '@aws-amplify/backend';

export const adminWithdrawPlatformBalance = defineFunction({
  name: 'admin-withdraw-platform-balance',
  entry: './handler.ts',
  resourceGroupName: 'data',
  timeoutSeconds: 30,
  environment: {
    MYCOOLPAY_PUBLIC_KEY: secret('MYCOOLPAY_PUBLIC_KEY'),
    MYCOOLPAY_PRIVATE_KEY: secret('MYCOOLPAY_PRIVATE_KEY'),
    STATIC_IP_PROXY_URL: secret('STATIC_IP_PROXY_URL'),
  },
});