import { defineFunction, secret } from '@aws-amplify/backend';

export const coolPayWebhook = defineFunction({
  name: 'coolpay-webhook',
  entry: './handler.ts',
  environment: {
    // Ajoute ici le secret de signature une fois trouvé sur le dashboard
  },
});