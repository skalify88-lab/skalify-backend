import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { ProxyAgent } from 'undici';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

const verifier = CognitoJwtVerifier.create({
  userPoolId: requireEnv('COGNITO_USER_POOL_ID'),
  tokenUse: 'id',
  clientId: requireEnv('COGNITO_CLIENT_ID'),
});

export const handler = async (event: any) => {
  try {
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (!authHeader) throw new Error('Non authentifié');
    await verifier.verify(authHeader.replace('Bearer ', '')); // NOUVEAU : vérifie juste l'identité, pas le solde ici

    const body = JSON.parse(event.body);
    const { amount, phoneNumber, appTransactionRef } = body; // NOUVEAU : appTransactionRef fourni par le client

    const proxyAgent = new ProxyAgent(requireEnv('STATIC_IP_PROXY_URL'));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(
        `https://my-coolpay.com/api/${requireEnv('MYCOOLPAY_PUBLIC_KEY')}/payout`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-PRIVATE-KEY': requireEnv('MYCOOLPAY_PRIVATE_KEY'),
          },
          body: JSON.stringify({
            transaction_amount: amount,
            transaction_currency: 'XAF',
            transaction_reason: 'Retrait solde S.Kalify',
            transaction_operator: 'CM_OM',
            app_transaction_ref: appTransactionRef,
            customer_phone_number: phoneNumber,
            customer_name: 'S.Kalify',
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

      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    } catch (e: any) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') {
        throw new Error('Le proxy n\'a pas répondu à temps');
      }
      throw e;
    }
  } catch (e: any) {
    return { statusCode: 403, body: JSON.stringify({ success: false, message: e.message }) };
  }
};