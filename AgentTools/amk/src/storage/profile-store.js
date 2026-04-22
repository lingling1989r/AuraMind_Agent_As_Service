import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureInsideRoot } from '../utils/path-utils.js';

const ALLOWED_PROFILE_RECORD_TYPES = new Set(['profile', 'prove']);

function normalizeRecordType(recordType) {
  const normalized = String(recordType || '').trim();
  if (!ALLOWED_PROFILE_RECORD_TYPES.has(normalized)) {
    throw new Error('recordType must be one of: profile, prove');
  }
  return normalized;
}

function getProfileRecordPath(scope, recordType) {
  const normalizedType = normalizeRecordType(recordType);
  const fullPath = path.join(scope.profileRoot, `${normalizedType}.json`);
  ensureInsideRoot(scope.profileRoot, fullPath);
  return {
    recordType: normalizedType,
    fullPath,
  };
}

export async function writeProfileRecord(scope, payload) {
  const { recordType, fullPath } = getProfileRecordPath(scope, payload.recordType);
  await fs.mkdir(scope.profileRoot, { recursive: true });
  await fs.writeFile(fullPath, JSON.stringify(payload.data ?? null, null, 2), 'utf8');

  return {
    recordType,
    fullPath,
  };
}

export async function readProfileRecord(scope, resourceRef) {
  const { recordType, fullPath } = getProfileRecordPath(scope, resourceRef.recordType);

  try {
    const content = await fs.readFile(fullPath, 'utf8');
    return {
      recordType,
      fullPath,
      data: JSON.parse(content),
    };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {
        recordType,
        fullPath,
        data: null,
      };
    }
    throw error;
  }
}
