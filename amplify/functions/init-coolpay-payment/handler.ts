import type { Schema } from '../../data/resource';
import { env } from '$amplify/env/init-coolpay-payment';

export const handler: Schema['initCoolPayPaymentMutation']['functionHandler'] = async (event) => {
  const { amount, phoneNumber, operator } = event.arguments;

  const appTransactionRef = `SKALIFY-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const response = await fetch(
    `https://my-coolpay.com/api/${env.MYCOOLPAY_PUBLIC_KEY}/payin`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-PRIVATE-KEY': env.MYCOOLPAY_PRIVATE_KEY,
      },
      body: JSON.stringify({
        transaction_amount: amount,
        transaction_currency: 'XAF',
        transaction_reason: 'Recharge S.Kalify',
        app_transaction_ref: appTransactionRef,
        customer_phone_number: phoneNumber,
        customer_name: 'Client S.Kalify', // ⚠️ à affiner si besoin plus tard
        customer_lang: 'fr',
      }),
    }
  );

  const data = await response.json();

  if (!response.ok || data.status !== 'success') {
    throw new Error(data.message || 'Erreur lors de l\'initialisation du paiement My-CoolPay');
  }

  return {
    appTransactionRef,
    transactionRef: data.transaction_ref ?? null,
    amount,
    phoneNumber,
    operator,
    status: 'PENDING',
  };
};