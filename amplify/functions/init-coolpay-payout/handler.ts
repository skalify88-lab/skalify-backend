import type { Schema } from '../../data/resource';
import { env } from '$amplify/env/init-coolpay-payout';
import { ProxyAgent } from 'undici';

export const handler: Schema['initCoolPayPayoutMutation']['functionHandler'] = async (event) => {
  const { amount, phoneNumber, appTransactionRef } = event.arguments;

  const proxyAgent = new ProxyAgent(env.STATIC_IP_PROXY_URL);
  const controller = new AbortController(); // NOUVEAU
  const timeoutId = setTimeout(() => controller.abort(), 15000); // NOUVEAU : 15s, bien avant le mur des 30s

  try {
    const response = await fetch(
      `https://my-coolpay.com/api/${env.MYCOOLPAY_PUBLIC_KEY}/payout`,
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
          transaction_reason: 'Retrait S.Kalify',
          transaction_operator: 'CM_OM',
          app_transaction_ref: appTransactionRef,
          customer_phone_number: phoneNumber,
          customer_name: 'Client S.Kalify',
          customer_lang: 'fr',
        }),
        dispatcher: proxyAgent,
        signal: controller.signal,
      } as any
    );

    clearTimeout(timeoutId);

    const data = await response.json();

    if (!response.ok || data.status !== 'success') {
      throw new Error(data.message || 'Erreur lors du retrait My-CoolPay');
    }

    return {
      appTransactionRef,
      transactionRef: data.transaction_ref ?? null,
      amount,
      phoneNumber,
      status: 'PENDING',
    };
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      throw new Error('Le proxy n\'a pas répondu à temps — statut réellement inconnu, vérification nécessaire');
    }
    throw e;
  }
};