import { createHash } from 'node:crypto';

export function hashScopeId(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}
