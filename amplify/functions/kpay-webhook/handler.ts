import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import * as crypto from 'crypto';
import { env } from '$amplify/env/kpay-webhook';

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

export const handler = async (event: any) => {
  const rawBody = event.body;
  const signature = event.headers?.['x-kpay-signature'] || event.headers?.['X-KPAY-Signature'];

  const expected = crypto.createHmac('sha256', env.KPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  if (!signature || signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return { statusCode: 400, body: 'Invalid signature' };
  }

  const payload = JSON.parse(rawBody);
  const { paymentId, externalId, status, failureReason } = payload;

  const scanResult = await ddb.send(new ScanCommand({
    TableName: env.PAYMENT_INTENT_TABLE_NAME,
    FilterExpression: 'externalId = :eid',
    ExpressionAttributeValues: { ':eid': externalId },
  }));
  const intent = scanResult.Items?.[0];
  if (!intent) return { statusCode: 200, body: 'OK (intent introuvable, ignoré)' };

  await ddb.send(new UpdateCommand({
    TableName: env.PAYMENT_INTENT_TABLE_NAME,
    Key: { id: intent.id },
    UpdateExpression: 'SET #status = :status, kpayPaymentId = :pid, failureReason = :reason',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':status': status, ':pid': paymentId, ':reason': failureReason ?? null },
  }));

  if (status === 'COMPLETED') {
    const balanceScan = await ddb.send(new ScanCommand({
      TableName: env.BALANCE_TABLE_NAME,
      FilterExpression: '#owner = :owner',
      ExpressionAttributeNames: { '#owner': 'owner' },
      ExpressionAttributeValues: { ':owner': intent.buyerOwner },
    }));
    const balance = balanceScan.Items?.[0];

    if (balance) {
      await ddb.send(new UpdateCommand({
        TableName: env.BALANCE_TABLE_NAME,
        Key: { id: balance.id },
        UpdateExpression: 'SET amount = :newAmount',
        ExpressionAttributeValues: { ':newAmount': (balance.amount ?? 0) + intent.amount },
      }));
    } else {
      await ddb.send(new PutCommand({
        TableName: env.BALANCE_TABLE_NAME,
        Item: { id: randomUUID(), owner: intent.buyerOwner, amount: intent.amount, currency: 'XAF', __typename: 'Balance' },
      }));
    }

    await ddb.send(new PutCommand({
      TableName: env.TRANSACTION_TABLE_NAME,
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