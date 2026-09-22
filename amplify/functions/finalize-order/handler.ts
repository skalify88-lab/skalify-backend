import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand, ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
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

    if (isBuyer) {
      if (enteredCode !== order.sellerCode) {
        return { statusCode: 200, body: JSON.stringify({ success: false, message: 'Code incorrect' }) };
      }
      await ddb.send(new UpdateCommand({
        TableName: orderTable,
        Key: { id: orderId },
        UpdateExpression: 'SET buyerEnteredCode = :code',
        ExpressionAttributeValues: { ':code': enteredCode },
      }));
    } else {
      if (enteredCode !== order.buyerCode) {
        return { statusCode: 200, body: JSON.stringify({ success: false, message: 'Code incorrect' }) };
      }
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

    if (buyerValid && sellerValid) {
      try {
        await ddb.send(new UpdateCommand({
          TableName: orderTable,
          Key: { id: orderId },
          UpdateExpression: 'SET #status = :completed',
          ConditionExpression: '#status <> :completed',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':completed': 'COMPLETED' },
        }));
      } catch (e: any) {
        if (e.name === 'ConditionalCheckFailedException') {
          return { statusCode: 200, body: JSON.stringify({ success: true, orderStatus: 'COMPLETED' }) };
        }
        throw e;
      }

      // NOUVEAU : on arrive ici UNIQUEMENT si la mise à jour conditionnelle a réussi — plus de completedSuccessfully nécessaire
      const grossAmount = parseFloat(updatedOrder.total); // NOUVEAU : sorti du if, portée correcte désormais
      const platformFees = Math.round(grossAmount * 0.06);
      const netAmount = grossAmount - platformFees;

      const sellerScan = await ddb.send(new ScanCommand({
        TableName: balanceTable,
        FilterExpression: 'contains(#owner, :sellerSuffix)',
        ExpressionAttributeNames: { '#owner': 'owner' },
        ExpressionAttributeValues: { ':sellerSuffix': `::${updatedOrder.sellerOwner}` },
      }));
      const sellerBalance = sellerScan.Items?.[0];

      if (sellerBalance) {
        // Cas normal : le vendeur a déjà un solde existant
        await ddb.send(new UpdateCommand({
          TableName: balanceTable,
          Key: { id: sellerBalance.id },
          UpdateExpression: 'SET amount = :newAmount',
          ExpressionAttributeValues: { ':newAmount': (sellerBalance.amount ?? 0) + netAmount },
        }));

        await ddb.send(new PutCommand({
          TableName: transactionTable,
          Item: {
            id: randomUUID(),
            owner: sellerBalance.owner,
            balanceId: sellerBalance.id,
            amount: netAmount,
            grossAmount,
            aggregatorFees: 0,
            platformFees,
            type: 'CREDIT',
            currency: 'XAF',
            reason: `Vente : ${updatedOrder.articleName}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            __typename: 'Transaction',
          },
        }));
      } else { // NOUVEAU : le vendeur n'a encore jamais eu de solde — on en crée un, correctement identifié
        const userProfileTable = requireEnv('USER_PROFILE_TABLE_NAME');

        const profileScan = await ddb.send(new ScanCommand({
          TableName: userProfileTable,
          FilterExpression: 'username = :username',
          ExpressionAttributeValues: { ':username': updatedOrder.sellerOwner },
        }));
        const sellerProfile = profileScan.Items?.[0];

        if (sellerProfile) {
          const newBalanceId = randomUUID();

          await ddb.send(new PutCommand({
            TableName: balanceTable,
            Item: {
              id: newBalanceId,
              owner: sellerProfile.owner, // NOUVEAU : le vrai composite sub::username, retrouvé via UserProfile
              amount: netAmount,
              currency: 'XAF',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              __typename: 'Balance',
            },
          }));

          await ddb.send(new PutCommand({
            TableName: transactionTable,
            Item: {
              id: randomUUID(),
              owner: sellerProfile.owner,
              balanceId: newBalanceId,
              amount: netAmount,
              grossAmount,
              aggregatorFees: 0,
              platformFees,
              type: 'CREDIT',
              currency: 'XAF',
              reason: `Vente : ${updatedOrder.articleName}`,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              __typename: 'Transaction',
            },
          }));
        } else {
          // NOUVEAU : situation anormale — un vendeur sans UserProfile ne devrait jamais exister,
          // on logue clairement plutôt que d'échouer silencieusement
          console.error(`Impossible de créer le solde vendeur : UserProfile introuvable pour ${updatedOrder.sellerOwner}`);
        }
      }
      // ⚠️ si sellerBalance est introuvable (vendeur sans aucun solde préexistant), rien n'est crédité ici — cas à surveiller

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
          source: 'SALE_COMMISSION',
          reason: `Commission vente — ${updatedOrder.articleName}`,
          relatedOrderId: orderId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          __typename: 'PlatformTransaction',
        },
      }));

      return { statusCode: 200, body: JSON.stringify({ success: true, orderStatus: 'COMPLETED' }) };
    }

    return { statusCode: 200, body: JSON.stringify({ success: true, orderStatus: updatedOrder.status }) };
  } catch (e: any) {
    return { statusCode: 403, body: JSON.stringify({ success: false, message: e.message }) };
  }
};