import { MongoClient } from 'mongodb';
import dns from 'node:dns';
import { readConfig } from '../src/config';
import { setupPricing } from '../src/services/pricing/setup';

// No dotenv import. The operator supplies an explicitly scoped environment.
async function main() {
const args=process.argv.slice(2),config=readConfig();
const database=args.find(a=>a.startsWith('--database='))?.slice('--database='.length);
if(args.some(a=>a!=='--apply'&&!a.startsWith('--database='))||!database||database!==config.databaseName) {
  console.error('Pass --database=<configured database> and optionally --apply. Default is report only.');process.exit(1);
}
if(!config.mongoUri) {console.error('MongoDB is not configured.');process.exit(1);}
if(config.mongoDnsServers.length) dns.setServers(config.mongoDnsServers);
const client=new MongoClient(config.mongoUri,{maxPoolSize:5,serverSelectionTimeoutMS:5000});
try {
  await client.connect();
  const report=await setupPricing(client.db(database),args.includes('--apply'));
  console.log(JSON.stringify(report,null,2));
} catch { console.error('Pricing setup failed; verify scoped connectivity, privileges and collection compatibility. No credential details were logged.');process.exitCode=1; }
finally {await client.close();}
}
void main();
