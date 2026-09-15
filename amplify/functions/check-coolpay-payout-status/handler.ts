import type { Schema } from '../../data/resource';
import { env } from '$amplify/env/check-coolpay-payout-status';
import { ProxyAgent } from 'undici';

export const handler: Schema['checkCoolPayPayoutStatusMutation']['functionHandler'] = async (event) => {
  const { appTransactionRef } = event.arguments;

  const proxyAgent = new ProxyAgent(env.STATIC_IP_PROXY_URL);

  const response = await fetch(
    `https://my-coolpay.com/api/${env.MYCOOLPAY_PUBLIC_KEY}/checkStatus/${appTransactionRef}`,
    {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-PRIVATE-KEY': env.MYCOOLPAY_PRIVATE_KEY,
      },
      dispatcher: proxyAgent,
    } as any
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Impossible de vérifier le statut du retrait');
  }

  return {
    appTransactionRef: data.app_transaction_ref ?? appTransactionRef,
    transactionRef: data.transaction_ref ?? null,
    amount: data.transaction_amount,
    phoneNumber: data.customer_phone_number ?? '',
    status: data.status,
  };
};