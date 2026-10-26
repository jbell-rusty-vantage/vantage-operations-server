import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { mkdir, readdir, access } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { MongoClient } from 'mongodb';

const root = fileURLToPath(new URL('../', import.meta.url));
const local = path.join(root, '.local');
const children = [];
const container = 'vantage-operations-pricing-local';
let dockerStarted = false;
let nativeStarted = false;
let stopping;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function stop() {
  if (stopping) return stopping;
  stopping = (async () => {
    if (nativeStarted) {
      const connection = new MongoClient('mongodb://127.0.0.1:27018/?directConnection=true', { serverSelectionTimeoutMS: 1000 });
      try { await connection.db('admin').command({ shutdown: 1 }); } catch { /* shutdown closes its own connection */ }
      finally { await connection.close(); }
    }
    for (const child of children.reverse()) {
      if (child.exitCode === null) {
        if (child.connected) child.send('shutdown');
        else if (!nativeStarted) child.kill('SIGTERM');
        await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(6000)]);
        if (child.exitCode === null) child.kill('SIGKILL');
      }
    }
    if (dockerStarted) execFileSync('docker', ['stop', '--time', '10', container], { stdio: 'ignore' });
  })();
  return stopping;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void stop().finally(() => process.exit(0)));
async function freePort(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error(`Port ${port} is occupied; stop its owner before starting this stack.`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
function child(command, args, env, logName) {
  const log = createWriteStream(path.join(local, logName), { flags: 'a' });
  const process = spawn(command, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', ...(logName === 'api.log' ? ['ipc'] : [])] });
  process.stdout.pipe(log); process.stderr.pipe(log);
  process.on('error', () => { /* startup polling provides the bounded diagnostic */ });
  children.push(process);
  return process;
}
async function nativeMongo() {
  const base = 'C:/Program Files/MongoDB/Server';
  for (const version of (await readdir(base).catch(() => [])).sort().reverse()) {
    const binary = path.join(base, version, 'bin/mongod.exe');
    if (await access(binary).then(() => true, () => false)) return binary;
  }
}
async function retry(action, description, seconds = 60) {
  const end = Date.now() + seconds * 1000;
  while (Date.now() < end) {
    try { return await action(); } catch { await delay(500); }
  }
  throw new Error(`${description} did not become ready; inspect ignored .local logs.`);
}
try {
  if (process.argv.slice(2).some((arg) => arg !== '--check')) throw new Error('Usage: pnpm dev:stack [--check]');
  await freePort(27018); await freePort(3001);
  await mkdir(path.join(local, 'mongo-data'), { recursive: true });
  const binary = await nativeMongo();
  const mongoArgs = ['--replSet', 'pricing-local', '--bind_ip', '127.0.0.1', '--port', '27018'];
  if (binary) {
    child(binary, [...mongoArgs, '--dbpath', path.join(local, 'mongo-data')], process.env, 'mongo.log');
    nativeStarted = true;
  }
  else {
    // Docker needs an all-interface listener inside its private network namespace;
    // the published host port remains loopback-only.
    execFileSync('docker', ['run', '--detach', '--rm', '--name', container,
      '--publish', '127.0.0.1:27018:27018', '--mount', 'type=volume,source=vantage-operations-pricing-local,target=/data/db',
      'mongo:7', 'mongod', '--replSet', 'pricing-local', '--bind_ip_all', '--port', '27018'],
    { stdio: 'ignore', timeout: 300000, windowsHide: true });
    dockerStarted = true;
  }
  const direct = new MongoClient('mongodb://127.0.0.1:27018/?directConnection=true', { serverSelectionTimeoutMS: 1500 });
  try {
    await retry(() => direct.connect(), 'Local MongoDB');
    const admin = direct.db('admin');
    try {
      const status = await admin.command({ replSetGetStatus: 1 });
      if (status.set !== 'pricing-local') throw new Error('Unexpected replica set');
    } catch (error) {
      if (error.code !== 94) throw error;
      await admin.command({ replSetInitiate: { _id: 'pricing-local', members: [{ _id: 0, host: '127.0.0.1:27018' }] } });
    }
    await retry(async () => {
      if (!(await admin.command({ hello: 1 })).isWritablePrimary) throw new Error('Election pending');
    }, 'Local replica set');
  } finally { await direct.close(); }
  const secret = randomBytes(32).toString('hex');
  // Deliberately allowlist OS necessities, excluding inherited app credentials,
  // NODE_OPTIONS and dotenv loading hooks.
  const env = Object.fromEntries(['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE'].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  Object.assign(env, { MONGO_URI: 'mongodb://127.0.0.1:27018/vantage_pricing_local?replicaSet=pricing-local', TEST_MODE: 'true',
    TEST_MONGO_DATABASE_NAME: 'vantage_pricing_local', PORT: '3001', VANTAGE_API_SECRET: secret,
    CORS_ALLOWED_ORIGINS: 'http://localhost:3411,http://127.0.0.1:3411', LOG_LEVEL: 'info' });
  const api = child(process.execPath, ['--import', 'tsx', 'ops/dev-server.ts'], env, 'api.log');
  await retry(async () => {
    if (!(await fetch('http://127.0.0.1:3001/health', { signal: AbortSignal.timeout(1500) })).ok) throw new Error('Liveness failed');
    if (!(await fetch('http://127.0.0.1:3001/api/v1/health/ready', { headers: { 'x-api-secret': secret }, signal: AbortSignal.timeout(2500) })).ok) throw new Error('Readiness failed');
    if ((await fetch('http://127.0.0.1:3001/api/v1/health/ready')).status !== 401) throw new Error('Readiness auth failed');
  }, 'Operations API');
  console.log(`Local stack ready (${binary ? 'native MongoDB' : 'Docker MongoDB'}). Liveness and authenticated database readiness passed; unauthenticated readiness denied.`);
  console.log('API: http://127.0.0.1:3001 | Fixture origin: http://localhost:3411 | Database: vantage_pricing_local (pricing-local)');
  if (process.argv.includes('--check')) await stop();
  else {
    console.log('Ctrl+C stops owned processes and retains local data.');
    api.once('exit', () => void stop().finally(() => process.exit(1)));
  }
} catch (error) {
  // Do not print driver/process errors, which may include environment details.
  console.error(error.message?.startsWith('Port ') ? error.message : 'Local stack startup failed. Check Docker/native Mongo availability and ignored .local logs.');
  await stop();
  process.exitCode = 1;
}
