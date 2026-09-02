import type { Schema } from '../../data/resource';
import { env } from '$amplify/env/init-kpay-payment';

export const handler: Schema['initKpayPaymentMutation']['functionHandler'] = async (event) => {
  const { amount, phoneNumber, provider } = event.arguments;

  const externalId = `SKALIFY-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const kpayResponse = await fetch('https://admin.kpay.site/api/v1/payments/init', {
    method: 'POST',
    headers: {
      'X-API-Key': env.KPAY_API_KEY,
      'X-Secret-Key': env.KPAY_SECRET_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ amount, phoneNumber, provider, externalId }),
  });

  const kpayData = await kpayResponse.json();

  if (!kpayResponse.ok) {
    throw new Error(kpayData.message || 'Erreur lors de l\'initialisation du paiement K-PAY');
  }

  return {
    externalId,
    kpayPaymentId: kpayData.id,
    amount,
    phoneNumber,
    provider,
    status: kpayData.status ?? 'PENDING',
  };
};