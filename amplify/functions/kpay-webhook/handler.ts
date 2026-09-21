import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import * as crypto from 'crypto';

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

function requireEnv(name: string): string { // NOUVEAU : petit garde-fou, échoue clairement si une variable manque
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

export const handler = async (event: any) => {
  const rawBody = event.body;
  const signature = event.headers?.['x-kpay-signature'] || event.headers?.['X-KPAY-Signature'];

  const webhookSecret = requireEnv('KPAY_WEBHOOK_SECRET'); // NOUVEAU : process.env au lieu de $amplify/env
  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  if (!signature || signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return { statusCode: 400, body: 'Invalid signature' };
  }

  const payload = JSON.parse(rawBody);
  const { paymentId, externalId, status, failureReason } = payload;

  const paymentIntentTable = requireEnv('PAYMENT_INTENT_TABLE_NAME'); // NOUVEAU
  const balanceTable = requireEnv('BALANCE_TABLE_NAME'); // NOUVEAU
  const transactionTable = requireEnv('TRANSACTION_TABLE_NAME'); // NOUVEAU

  const scanResult = await ddb.send(new ScanCommand({
    TableName: paymentIntentTable,
    FilterExpression: 'externalId = :eid',
    ExpressionAttributeValues: { ':eid': externalId },
  }));
  const intent = scanResult.Items?.[0];
  if (!intent) return { statusCode: 200, body: 'OK (intent introuvable, ignoré)' };

  await ddb.send(new UpdateCommand({
    TableName: paymentIntentTable,
    Key: { id: intent.id },
    UpdateExpression: 'SET #status = :status, kpayPaymentId = :pid, failureReason = :reason',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':status': status, ':pid': paymentId, ':reason': failureReason ?? null },
  }));

  if (status === 'COMPLETED') {
      if (intent.status === 'COMPLETED') { // NOUVEAU
          return { statusCode: 200, body: 'OK (déjà traité)' };
      }

      const grossAmount = intent.amount;
      const aggregatorFees = 0; // ⚠️ à confirmer avec K-PAY — pas de champ de frais connu dans leur callback actuel
      const platformFees = Math.round(grossAmount * 0.01);
      const netAmount = grossAmount - aggregatorFees - platformFees;

      const realOwner = `${intent.buyerSub}::${intent.buyerOwner}`;

      const balanceScan = await ddb.send(new ScanCommand({
        TableName: balanceTable, // NOUVEAU : balanceTable, pas paymentIntentTable
        FilterExpression: '#owner = :owner',
        ExpressionAttributeNames: { '#owner': 'owner' },
        ExpressionAttributeValues: { ':owner': realOwner },
      }));
      const balance = balanceScan.Items?.[0];

      if (balance) {
        await ddb.send(new UpdateCommand({
          TableName: balanceTable,
          Key: { id: balance.id },
          UpdateExpression: 'SET amount = :newAmount',
          ExpressionAttributeValues: { ':newAmount': (balance.amount ?? 0) + netAmount },
        }));
      } else {
        await ddb.send(new PutCommand({
          TableName: balanceTable,
          Item: { id: randomUUID(), owner: realOwner, amount: netAmount, currency: 'XAF', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), __typename: 'Balance' }, // NOUVEAU : createdAt/updatedAt ajoutés aussi, absents ici
        }));
      }

      await ddb.send(new PutCommand({
        TableName: transactionTable,
        Item: {
          id: randomUUID(),
          owner: realOwner,
          balanceId: balance?.id ?? '',
          amount: netAmount, // NOUVEAU : net
          grossAmount, // NOUVEAU
          aggregatorFees, // NOUVEAU
          platformFees, // NOUVEAU
          type: 'CREDIT',
          currency: 'XAF',
          reason: 'Recharge Mobile Money (K-PAY)',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          __typename: 'Transaction',
        },
      }));


      // NOUVEAU : crédite le solde S.Kalify de sa commission
      const platformBalanceTable = requireEnv('PLATFORM_BALANCE_TABLE_NAME');
      const platformTransactionTable = requireEnv('PLATFORM_TRANSACTION_TABLE_NAME');

      const platformScan = await ddb.send(new ScanCommand({ TableName: platformBalanceTable }));
      const platformBalance = platformScan.Items?.[0];

      if (platformBalance) {
        await ddb.send(new UpdateCommand({
          TableName: platformBalanceTable,
          Key: { id: platformBalance.id },
          UpdateExpression: 'SET amount = :newAmount',
          ExpressionAttributeValues: { ':newAmount': (platformBalance.amount ?? 0) + platformFees },
        }));
      } else {
        await ddb.send(new PutCommand({
          TableName: platformBalanceTable,
          Item: { id: randomUUID(), amount: platformFees, currency: 'XAF', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), __typename: 'PlatformBalance' },
        }));
      }

      await ddb.send(new PutCommand({
        TableName: platformTransactionTable,
        Item: {
          id: randomUUID(),
          amount: platformFees,
          type: 'CREDIT',
          source: 'DEPOSIT_FEE',
          reason: `Commission dépôt — ${intent.buyerOwner}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          __typename: 'PlatformTransaction',
        },
      }));




  }

  return { statusCode: 200, body: 'OK' };
};