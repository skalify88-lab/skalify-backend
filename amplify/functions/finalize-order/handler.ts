import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  ScanCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

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

// Retrouve la ligne dont `owner` vaut "<sub>::<username>" : scan paginé, puis vérification exacte de la fin
async function findByOwner(table: string, username: string): Promise<Record<string, any> | undefined> {
  let lastKey: Record<string, any> | undefined;
  do {
    const page = await ddb.send(new ScanCommand({
      TableName: table,
      FilterExpression: 'contains(#owner, :suffix)',
      ExpressionAttributeNames: { '#owner': 'owner' },
      ExpressionAttributeValues: { ':suffix': `::${username}` },
      ExclusiveStartKey: lastKey,
    }));
    const hit = page.Items?.find((i) => typeof i.owner === 'string' && i.owner.endsWith(`::${username}`));
    if (hit) return hit;
    lastKey = page.LastEvaluatedKey;
  } while (lastKey);
  return undefined;
}

const reply = (body: Record<string, any>) => ({ statusCode: 200, body: JSON.stringify(body) });

export const handler = async (event: any) => {
  try {
    const authHeader = event.headers?.authorization || event.headers?.Authorization;
    if (!authHeader) throw new Error('Non authentifié');
    const token = authHeader.replace('Bearer ', '');
    const payload = await verifier.verify(token);
    const username = payload['cognito:username'] as string;

    const body = JSON.parse(event.body);
    const { orderId, enteredCode } = body;

    const orderTable = requireEnv('ORDER_TABLE_NAME');
    const balanceTable = requireEnv('BALANCE_TABLE_NAME');
    const transactionTable = requireEnv('TRANSACTION_TABLE_NAME');
    const platformBalanceTable = requireEnv('PLATFORM_BALANCE_TABLE_NAME');
    const platformTransactionTable = requireEnv('PLATFORM_TRANSACTION_TABLE_NAME');

    const orderResult = await ddb.send(new GetCommand({ TableName: orderTable, Key: { id: orderId } }));
    const order = orderResult.Item;
    if (!order) throw new Error('Commande introuvable');

    const isBuyer = order.buyerOwner === username;
    const isSeller = order.sellerOwner === username;
    if (!isBuyer && !isSeller) throw new Error('Vous ne faites pas partie de cette commande');

    if (order.status === 'COMPLETED') return reply({ success: true, orderStatus: 'COMPLETED' });
    if (order.status === 'REJECTED') return reply({ success: false, message: 'Cette commande a été annulée' });

    if (isBuyer) {
      if (enteredCode !== order.sellerCode) return reply({ success: false, message: 'Code incorrect' });
      await ddb.send(new UpdateCommand({
        TableName: orderTable,
        Key: { id: orderId },
        UpdateExpression: 'SET buyerEnteredCode = :code',
        ExpressionAttributeValues: { ':code': enteredCode },
      }));
    } else {
      if (enteredCode !== order.buyerCode) return reply({ success: false, message: 'Code incorrect' });
      await ddb.send(new UpdateCommand({
        TableName: orderTable,
        Key: { id: orderId },
        UpdateExpression: 'SET sellerEnteredCode = :code',
        ExpressionAttributeValues: { ':code': enteredCode },
      }));
    }

    const refreshed = await ddb.send(new GetCommand({ TableName: orderTable, Key: { id: orderId } }));
    const updatedOrder = refreshed.Item!;

    const buyerValid = updatedOrder.buyerEnteredCode === updatedOrder.sellerCode;
    const sellerValid = updatedOrder.sellerEnteredCode === updatedOrder.buyerCode;

    if (!(buyerValid && sellerValid)) {
      return reply({ success: true, orderStatus: updatedOrder.status });
    }

    const grossAmount = parseFloat(updatedOrder.total);
    const platformFees = Math.round(grossAmount * 0.06);
    const netAmount = grossAmount - platformFees;

    // 1. Tout résoudre AVANT d'écrire quoi que ce soit : un compte introuvable fait échouer proprement
    const sellerBalance = await findByOwner(balanceTable, updatedOrder.sellerOwner);
    let sellerOwnerValue: string;
    if (sellerBalance) {
      sellerOwnerValue = sellerBalance.owner;
    } else {
      const sellerProfile = await findByOwner(requireEnv('USER_PROFILE_TABLE_NAME'), updatedOrder.sellerOwner);
      if (!sellerProfile) {
        throw new Error(`Compte vendeur introuvable (${updatedOrder.sellerOwner}) — aucune écriture effectuée`);
      }
      sellerOwnerValue = sellerProfile.owner;
    }
    const sellerBalanceId: string = sellerBalance?.id ?? randomUUID();

    const platformScan = await ddb.send(new ScanCommand({ TableName: platformBalanceTable }));
    const platformBalance = platformScan.Items?.[0];

    const now = new Date().toISOString();

    // 2. Une seule transaction : la réclamation de la commande et tous les mouvements d'argent, ou rien
    const items: any[] = [
      {
        Update: {
          TableName: orderTable,
          Key: { id: orderId },
          UpdateExpression: 'SET #status = :completed',
          ConditionExpression: '#status <> :completed AND #status <> :rejected',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':completed': 'COMPLETED', ':rejected': 'REJECTED' },
        },
      },
      sellerBalance
        ? {
            Update: {
              TableName: balanceTable,
              Key: { id: sellerBalance.id },
              UpdateExpression: 'SET amount = if_not_exists(amount, :zero) + :delta',
              ExpressionAttributeValues: { ':zero': 0, ':delta': netAmount },
            },
          }
        : {
            Put: {
              TableName: balanceTable,
              Item: {
                id: sellerBalanceId,
                owner: sellerOwnerValue,
                amount: netAmount,
                currency: 'XAF',
                createdAt: now,
                updatedAt: now,
                __typename: 'Balance',
              },
            },
          },
      {
        Put: {
          TableName: transactionTable,
          Item: {
            id: randomUUID(),
            owner: sellerOwnerValue,
            balanceId: sellerBalanceId,
            amount: netAmount,
            grossAmount,
            aggregatorFees: 0,
            platformFees,
            type: 'CREDIT',
            currency: 'XAF',
            reason: `Vente : ${updatedOrder.articleName}`,
            createdAt: now,
            updatedAt: now,
            __typename: 'Transaction',
          },
        },
      },
      platformBalance
        ? {
            Update: {
              TableName: platformBalanceTable,
              Key: { id: platformBalance.id },
              UpdateExpression: 'SET amount = if_not_exists(amount, :zero) + :delta',
              ExpressionAttributeValues: { ':zero': 0, ':delta': platformFees },
            },
          }
        : {
            Put: {
              TableName: platformBalanceTable,
              Item: { id: randomUUID(), amount: platformFees, currency: 'XAF', createdAt: now, updatedAt: now, __typename: 'PlatformBalance' },
            },
          },
      {
        Put: {
          TableName: platformTransactionTable,
          Item: {
            id: randomUUID(),
            amount: platformFees,
            type: 'CREDIT',
            source: 'SALE_COMMISSION',
            reason: `Commission vente — ${updatedOrder.articleName}`,
            relatedOrderId: orderId,
            createdAt: now,
            updatedAt: now,
            __typename: 'PlatformTransaction',
          },
        },
      },
    ];

    try {
      await ddb.send(new TransactWriteCommand({ TransactItems: items }));
    } catch (e: any) {
      if (e.name === 'TransactionCanceledException') {
        const reasons = e.CancellationReasons ?? [];
        if (reasons[0]?.Code === 'ConditionalCheckFailed') {
          // La commande a été terminée ou annulée entre-temps
          const current = await ddb.send(new GetCommand({ TableName: orderTable, Key: { id: orderId } }));
          if (current.Item?.status === 'REJECTED') {
            return reply({ success: false, message: 'Cette commande a été annulée' });
          }
          return reply({ success: true, orderStatus: 'COMPLETED' });
        }
        throw new Error('Une opération simultanée est en cours, réessayez dans un instant');
      }
      throw e;
    }

    return reply({ success: true, orderStatus: 'COMPLETED' });
  } catch (e: any) {
    return { statusCode: 403, body: JSON.stringify({ success: false, message: e.message }) };
  }
};