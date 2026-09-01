import type { Schema } from '../../data/resource';
import { generateClient } from 'aws-amplify/data';
import { Amplify } from 'aws-amplify';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import { env } from '$amplify/env/kpay-webhook';
import * as crypto from 'crypto';

const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(env);
Amplify.configure(resourceConfig, libraryOptions);
const client = generateClient<Schema>();

export const handler = async (event: any) => {
  const rawBody = event.body;
  const signature = event.headers['x-kpay-signature'] || event.headers['X-KPAY-Signature'];

  const expected = crypto.createHmac('sha256', env.KPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');

  if (!signature || signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return { statusCode: 400, body: 'Invalid signature' };
  }

  const payload = JSON.parse(rawBody);
  const { paymentId, externalId, status, failureReason } = payload;

  const { data: intents } = await client.models.PaymentIntent.list({
    filter: { externalId: { eq: externalId } },
  });
  const intent = intents?.[0];

  if (!intent) {
    return { statusCode: 200, body: 'OK (intent introuvable, ignoré)' };
  }

  await client.models.PaymentIntent.update({
    id: intent.id,
    kpayPaymentId: paymentId,
    status,
    failureReason: failureReason ?? null,
  });

  if (status === 'COMPLETED') {
    const { data: balances } = await client.models.Balance.list({
      filter: { owner: { eq: intent.buyerOwner } },
    });
    const balance = balances?.[0];

    if (balance) {
      await client.models.Balance.update({ id: balance.id, amount: (balance.amount ?? 0) + intent.amount });
    } else {
      await client.models.Balance.create({ amount: intent.amount, currency: 'XAF' });
    }

    await client.models.Transaction.create({
      balanceId: balance?.id ?? '',
      amount: intent.amount,
      type: 'CREDIT',
      currency: 'XAF',
      reason: 'Recharge Mobile Money (K-PAY)',
      createdAt: new Date().toISOString(),
    });
  }

  return { statusCode: 200, body: 'OK' };
};