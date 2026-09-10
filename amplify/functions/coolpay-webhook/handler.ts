// amplify/functions/coolpay-webhook/handler.ts

export const handler = async (event: any) => {
  // TODO : logique réelle à ajouter une fois le mécanisme de signature My-CoolPay confirmé
  console.log('Webhook My-CoolPay reçu (pas encore traité) :', event.body);
  return { statusCode: 200, body: 'OK' };
};