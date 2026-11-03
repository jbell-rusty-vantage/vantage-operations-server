// Explicit opt-in local-only infrastructure probe. Does not read environment files.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';

const databaseName = `vantage_pricing_qa_${randomUUID().replaceAll('-', '')}`;
const client = new MongoClient('mongodb://127.0.0.1:27018/?replicaSet=pricing-local', {
  serverSelectionTimeoutMS: 3000,
});

try {
  await client.connect();
  const hello = await client.db('admin').command({ hello: 1 });
  assert.equal(hello.setName, 'pricing-local');
  assert.equal(hello.isWritablePrimary, true);
  assert.ok(databaseName.startsWith('vantage_pricing_qa_'));
  const db = client.db(databaseName);
  const collection = await db.createCollection('moving_pricing_qa_probe', {
    validator: { $jsonSchema: { bsonType: 'object', required: ['version'], properties: { version: { bsonType: 'int', minimum: 0 } } } },
  });
  await collection.createIndex({ operation_id: 1 }, { unique: true });
  await assert.rejects(collection.insertOne({ version: -1 }), (error) => error.code === 121);
  const session = client.startSession();
  try {
    await assert.rejects(session.withTransaction(async () => {
      await collection.insertOne({ version: 0, operation_id: 'aborted' }, { session });
      throw new Error('intentional local QA abort');
    }), /intentional local QA abort/);
    assert.equal(await collection.countDocuments(), 0);
    await session.withTransaction(async () => {
      await collection.insertOne({ version: 0, operation_id: 'committed' }, { session });
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
    assert.equal(await collection.countDocuments(), 1);
    await assert.rejects(collection.insertOne({ version: 1, operation_id: 'committed' }), (error) => error.code === 11000);
  } finally {
    await session.endSession();
  }
  console.log('PASS local pricing-local replica set: majority snapshot transaction commit/abort, validator and unique index enforcement.');
} finally {
  // Only the randomly allocated probe database can be removed by this script.
  if (client.topology?.isConnected()) await client.db(databaseName).dropDatabase();
  await client.close();
}
