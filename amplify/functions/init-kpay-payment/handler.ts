import type { Schema } from '../../data/resource';
import { generateClient } from 'aws-amplify/data';
import { Amplify } from 'aws-amplify';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { env } from '$amplify/env/init-kpay-payment';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>();

export const handler: Schema['initKpayPaymentMutation']['functionHandler'] = async (event) => {
  const { amount, phoneNumber, provider } = event.arguments;
  const username = event.identity && 'username' in event.identity ? event.identity.username : null;

  if (!username) {
    throw new Error('Utilisateur non authentifié');
  }

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

  const { data: intent, errors } = await client.models.PaymentIntent.create({
    buyerOwner: username,
    externalId,
    kpayPaymentId: kpayData.id,
    amount,
    phoneNumber,
    provider,
    status: 'PENDING',
  });

  if (errors || !intent) {
    throw new Error('Impossible de créer le suivi du paiement');
  }

  return intent;
};