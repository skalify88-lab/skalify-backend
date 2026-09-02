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
    const balanceScan = await ddb.send(new ScanCommand({
      TableName: balanceTable,
      FilterExpression: '#owner = :owner',
      ExpressionAttributeNames: { '#owner': 'owner' },
      ExpressionAttributeValues: { ':owner': intent.buyerOwner },
    }));
    const balance = balanceScan.Items?.[0];

    if (balance) {
      await ddb.send(new UpdateCommand({
        TableName: balanceTable,
        Key: { id: balance.id },
        UpdateExpression: 'SET amount = :newAmount',
        ExpressionAttributeValues: { ':newAmount': (balance.amount ?? 0) + intent.amount },
      }));
    } else {
      await ddb.send(new PutCommand({
        TableName: balanceTable,
        Item: { id: randomUUID(), owner: intent.buyerOwner, amount: intent.amount, currency: 'XAF', __typename: 'Balance' },
      }));
    }

    await ddb.send(new PutCommand({
      TableName: transactionTable,
      Item: {
        id: randomUUID(),
        owner: intent.buyerOwner,
        balanceId: balance?.id ?? '',
        amount: intent.amount,
        type: 'CREDIT',
        currency: 'XAF',
        reason: 'Recharge Mobile Money (K-PAY)',
        createdAt: new Date().toISOString(),
        __typename: 'Transaction',
      },
    }));
  }

  return { statusCode: 200, body: 'OK' };
};