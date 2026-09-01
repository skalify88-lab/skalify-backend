import { defineFunction, secret } from '@aws-amplify/backend';

export const initKpayPayment = defineFunction({
  name: 'init-kpay-payment',
  entry: './handler.ts',
  environment: {
    KPAY_API_KEY: secret('KPAY_API_KEY'),
    KPAY_SECRET_KEY: secret('KPAY_SECRET_KEY'),
  },
});