import type { Schema } from '../../data/resource';
import { env } from '$amplify/env/init-coolpay-payout';
import { ProxyAgent } from 'undici';


export const handler: Schema['initCoolPayPayoutMutation']['functionHandler'] = async (event) => {
  const { amount, phoneNumber } = event.arguments;

  const appTransactionRef = `SKALIFY-OUT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const proxyAgent = new ProxyAgent(env.STATIC_IP_PROXY_URL);

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
        transaction_operator: 'CM_OM', // ⚠️ valeur fixe, à confirmer — payout l'exige réellement contrairement à payin
        app_transaction_ref: appTransactionRef,
        customer_phone_number: phoneNumber,
        customer_name: 'Client S.Kalify',
        customer_lang: 'fr',
      }),
      dispatcher: proxyAgent,
    } as any
  );

  const data = await response.json();

  if (!response.ok || data.status !== 'success') {
    throw new Error(data.message || 'Erreur lors du retrait My-CoolPay');
  }

  const proxyAgent = new ProxyAgent(env.STATIC_IP_PROXY_URL);

  try {
    const ipCheck = await fetch('https://api.ipify.org?format=json', {
      dispatcher: proxyAgent,
    } as any);
    const ipData = await ipCheck.json();
    console.log('IP sortante réelle via le proxy :', ipData.ip);
  } catch (e) {
    console.error('Erreur test IP proxy :', e);
  }

  return {
    appTransactionRef,
    transactionRef: data.transaction_ref ?? null,
    amount,
    phoneNumber,
    status: 'PENDING',
  };
};