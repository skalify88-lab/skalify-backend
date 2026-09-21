import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { ProxyAgent } from 'undici';

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

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

async function verifyAdmin(authHeader: string | undefined) {
  if (!authHeader) throw new Error('Non authentifié');
  const token = authHeader.replace('Bearer ', '');
  const payload = await verifier.verify(token);
  const username = payload['cognito:username'] as string;

  const userProfileTable = requireEnv('USER_PROFILE_TABLE_NAME');
  const scan = await ddb.send(new ScanCommand({
    TableName: userProfileTable,
    FilterExpression: '#owner = :owner',
    ExpressionAttributeNames: { '#owner': 'owner' },
    ExpressionAttributeValues: { ':owner': `${payload.sub}::${username}` },
  }));
  const profile = scan.Items?.[0];

  if (!profile || profile.isAdmin !== true) {
    throw new Error('Accès refusé : droits administrateur requis');
  }
}

export const handler = async (event: any) => {
  try {
    await verifyAdmin(event.headers?.authorization || event.headers?.Authorization);

    const body = JSON.parse(event.body);
    const { amount, phoneNumber } = body;

    const platformBalanceTable = requireEnv('PLATFORM_BALANCE_TABLE_NAME');
    const platformTransactionTable = requireEnv('PLATFORM_TRANSACTION_TABLE_NAME');

    const platformScan = await ddb.send(new ScanCommand({ TableName: platformBalanceTable }));
    const platformBalance = platformScan.Items?.[0];

    if (!platformBalance || (platformBalance.amount ?? 0) < amount) {
      throw new Error('Solde S.Kalify insuffisant');
    }

    // Débit immédiat, avant l'appel — même principe que les retraits utilisateurs
    await ddb.send(new UpdateCommand({
      TableName: platformBalanceTable,
      Key: { id: platformBalance.id },
      UpdateExpression: 'SET amount = :newAmount',
      ExpressionAttributeValues: { ':newAmount': (platformBalance.amount ?? 0) - amount },
    }));

    const appTransactionRef = `SKALIFY-ADMIN-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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

      await ddb.send(new PutCommand({
        TableName: platformTransactionTable,
        Item: {
          id: randomUUID(),
          amount,
          type: 'DEBIT',
          source: 'ADMIN_WITHDRAWAL',
          reason: `Retrait admin vers ${phoneNumber}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          __typename: 'PlatformTransaction',
        },
      }));

      return { statusCode: 200, body: JSON.stringify({ success: true }) };
    } catch (e: any) {
      clearTimeout(timeoutId);
      // Remboursement automatique UNIQUEMENT si l'échec est confirmé (pas une simple ambiguïté réseau)
      if (e.name !== 'AbortError') {
        await ddb.send(new UpdateCommand({
          TableName: platformBalanceTable,
          Key: { id: platformBalance.id },
          UpdateExpression: 'SET amount = :newAmount',
          ExpressionAttributeValues: { ':newAmount': (platformBalance.amount ?? 0) },
        }));
      }
      throw e;
    }
  } catch (e: any) {
    return { statusCode: 403, body: JSON.stringify({ success: false, message: e.message }) };
  }
};