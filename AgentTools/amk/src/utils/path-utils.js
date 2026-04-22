import path from 'node:path';

export function ensureInsideRoot(rootPath, candidatePath) {
  const relativePath = path.relative(rootPath, candidatePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('Path escapes current scope root');
  }
}

export function normalizeRelativeResourcePath(resourcePath) {
  if (!resourcePath || typeof resourcePath !== 'string') {
    throw new Error('resourcePath is required');
  }

  const normalized = path.posix.normalize(resourcePath.replace(/\\/g, '/'));
  if (normalized.startsWith('../') || normalized === '..' || normalized.startsWith('/')) {
    throw new Error('Invalid resource path');
  }

  return normalized;
}
