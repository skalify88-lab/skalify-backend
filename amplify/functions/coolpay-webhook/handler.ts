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
    transaction_fees,
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



  if (transaction_type === 'PAYOUT') {
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
        UpdateExpression: 'SET #status = :status, transactionRef = :ref',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': transaction_status, ':ref': transaction_ref },
      }));

      const realOwner = `${payoutIntent.buyerSub}::${payoutIntent.buyerOwner}`;

      if (transaction_status === 'FAILED' || transaction_status === 'CANCELED') {
        // NOUVEAU : le retrait a échoué — on rembourse EXACTEMENT ce qui avait été débité au départ (voir point 2 côté client)
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
            ExpressionAttributeValues: { ':newAmount': (balance.amount ?? 0) + payoutIntent.debitedAmount }, // NOUVEAU : debitedAmount, pas payoutIntent.amount
          }));

          await ddb.send(new PutCommand({
            TableName: transactionTable,
            Item: {
              id: randomUUID(),
              owner: realOwner,
              balanceId: balance.id,
              amount: payoutIntent.debitedAmount,
              grossAmount: payoutIntent.amount,
              aggregatorFees: 0,
              platformFees: 0,
              type: 'CREDIT',
              currency: 'XAF',
              reason: 'Remboursement retrait échoué (My-CoolPay)',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              __typename: 'Transaction',
            },
          }));
        }
      } else if (transaction_status === 'SUCCESS') {
        // NOUVEAU : succès confirmé — crédite la commission S.Kalify (déjà débitée côté client, cf. point 2)
        const platformBalanceTable = requireEnv('PLATFORM_BALANCE_TABLE_NAME');
        const platformTransactionTable = requireEnv('PLATFORM_TRANSACTION_TABLE_NAME');

        const platformScan = await ddb.send(new ScanCommand({ TableName: platformBalanceTable }));
        const platformBalance = platformScan.Items?.[0];
        const platformFees = payoutIntent.platformFees ?? 0;

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
            source: 'WITHDRAWAL_FEE',
            reason: `Commission retrait — ${payoutIntent.buyerOwner}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            __typename: 'PlatformTransaction',
          },
        }));
      }
    }

    return { statusCode: 200, body: 'OK' };
  }



  if (transaction_type === 'PAYIN' && transaction_status === 'SUCCESS') {
    const grossAmount = transaction_amount;
    const aggregatorFees = transaction_fees ?? 0; // NOUVEAU
    const platformFees = Math.round(grossAmount * 0.01); // NOUVEAU : 1% fixe
    const netAmount = grossAmount - aggregatorFees - platformFees; // NOUVEAU

    const realOwner = `${intent.buyerSub}::${intent.buyerOwner}`;

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
        ExpressionAttributeValues: { ':newAmount': (balance.amount ?? 0) + netAmount }, // NOUVEAU : netAmount, pas grossAmount
      }));
    } else {
      await ddb.send(new PutCommand({
        TableName: balanceTable,
        Item: { id: randomUUID(), owner: realOwner, amount: netAmount, currency: 'XAF', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), __typename: 'Balance' },
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
        reason: 'Recharge Mobile Money (My-CoolPay)',
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