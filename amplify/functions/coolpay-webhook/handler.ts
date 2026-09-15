import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID, createHash } from 'crypto';

const ddbClient = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(ddbClient);

const MYCOOLPAY_IP = '15.236.140.89'; // NOUVEAU : IP fixe de leurs serveurs, confirmée dans la doc

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
  return value;
}

export const handler = async (event: any) => {
  const sourceIp = event.requestContext?.http?.sourceIp; // NOUVEAU
  if (sourceIp !== MYCOOLPAY_IP) {
    console.error('IP source inattendue :', sourceIp);
    return { statusCode: 403, body: 'KO' };
  }

  const payload = JSON.parse(event.body);
  const {
    app_transaction_ref,
    transaction_ref,
    transaction_type,
    transaction_amount,
    transaction_currency,
    transaction_operator,
    transaction_status,
    customer_phone_number,
    signature,
  } = payload;

  const privateKey = requireEnv('MYCOOLPAY_PRIVATE_KEY'); // NOUVEAU : à ajouter à l'environnement de la fonction

  const expectedSignature = createHash('md5') // NOUVEAU : MD5, pas HMAC-SHA256 comme K-PAY
    .update(
      `${transaction_ref}${transaction_type}${transaction_amount}${transaction_currency}${transaction_operator}${privateKey}`
    )
    .digest('hex');

  if (signature !== expectedSignature) {
    console.error('Signature invalide');
    return { statusCode: 403, body: 'KO' };
  }

  // À partir d'ici, la requête est authentique — traitement normal
  const paymentIntentTable = requireEnv('COOLPAY_INTENT_TABLE_NAME');
  const balanceTable = requireEnv('BALANCE_TABLE_NAME');
  const transactionTable = requireEnv('TRANSACTION_TABLE_NAME');

  const scanResult = await ddb.send(new ScanCommand({
    TableName: paymentIntentTable,
    FilterExpression: 'appTransactionRef = :ref',
    ExpressionAttributeValues: { ':ref': app_transaction_ref },
  }));
  const intent = scanResult.Items?.[0];
  if (!intent) return { statusCode: 200, body: 'OK' };

  await ddb.send(new UpdateCommand({
    TableName: paymentIntentTable,
    Key: { id: intent.id },
    UpdateExpression: 'SET #status = :status, transactionRef = :ref',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':status': transaction_status, ':ref': transaction_ref },
  }));

  if (transaction_status === 'SUCCESS') {

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
          ExpressionAttributeValues: { ':newAmount': (balance.amount ?? 0) + transaction_amount },
        }));
      } else {
        await ddb.send(new PutCommand({
          TableName: balanceTable,
          Item: { id: randomUUID(), owner: realOwner, amount: transaction_amount, currency: 'XAF', __typename: 'Balance' },
        }));
      }

      await ddb.send(new PutCommand({
        TableName: transactionTable,
        Item: {
          id: randomUUID(),
          owner: realOwner, // NOUVEAU : realOwner, pas intent.buyerOwner
          balanceId: balance?.id ?? '',
          amount: transaction_amount,
          type: 'CREDIT',
          currency: 'XAF',
          reason: 'Recharge Mobile Money (My-CoolPay)',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          __typename: 'Transaction',
        },
      }));
  }


  if (transaction_type === 'PAYOUT' && (transaction_status === 'FAILED' || transaction_status === 'CANCELED')) {
    // NOUVEAU : le solde a déjà été débité de façon optimiste côté client — on le rembourse si le retrait échoue
    const payoutIntentTable = requireEnv('COOLPAY_PAYOUT_INTENT_TABLE_NAME');

    const payoutScan = await ddb.send(new ScanCommand({
      TableName: payoutIntentTable,
      FilterExpression: 'appTransactionRef = :ref',
      ExpressionAttributeValues: { ':ref': app_transaction_ref },
    }));
    const payoutIntent = payoutScan.Items?.[0];

    if (payoutIntent) {
      await ddb.send(new UpdateCommand({
        TableName: payoutIntentTable,
        Key: { id: payoutIntent.id },
        UpdateExpression: 'SET #status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': transaction_status },
      }));

      const realOwner = `${payoutIntent.buyerSub}::${payoutIntent.buyerOwner}`;

      const balanceScan = await ddb.send(new ScanCommand({
        TableName: balanceTable,
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
          ExpressionAttributeValues: { ':newAmount': (balance.amount ?? 0) + payoutIntent.amount },
        }));

        await ddb.send(new PutCommand({
          TableName: transactionTable,
          Item: {
            id: randomUUID(),
            owner: realOwner,
            balanceId: balance.id,
            amount: payoutIntent.amount,
            type: 'CREDIT',
            currency: 'XAF',
            reason: 'Remboursement retrait échoué (My-CoolPay)',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            __typename: 'Transaction',
          },
        }));
      }
    }
  }


  return { statusCode: 200, body: 'OK' };
};