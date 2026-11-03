import { createHash, createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export interface SigningInput { actorId: string; method: string; target: string; body: string; secret: string; requestId: string; timestamp: string }
export interface AdminProtocol {
  pricingHeaders: (input: SigningInput) => Record<string, string>;
  pricingTarget: (method: string, parts: string[], query: URLSearchParams) => string;
}
const adminPath = resolve(__dirname, '../../../vantage-admin/server/operations-pricing/protocol.ts');
export const hasAdminProtocol = existsSync(adminPath);
export async function loadAdminProtocol(): Promise<AdminProtocol> {
  // Variable import deliberately keeps a standalone Operations checkout buildable.
  const source = pathToFileURL(adminPath).href;
  return await import(source) as AdminProtocol;
}
export function referenceHeaders(input: SigningInput): Record<string, string> {
  const lines = ['vantage-operations-admin-v1', 'transportation-pricing', input.actorId, 'owner', input.timestamp, input.requestId, input.method, input.target, createHash('sha256').update(input.body).digest('hex')];
  return { 'content-type': 'application/json', 'x-vantage-operations-actor-id': input.actorId, 'x-vantage-operations-role': 'owner', 'x-vantage-operations-timestamp': input.timestamp, 'x-vantage-operations-request-id': input.requestId, 'x-vantage-operations-signature': createHmac('sha256', input.secret).update(lines.join('\n')).digest('hex') };
}
