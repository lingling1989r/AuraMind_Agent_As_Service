import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureInsideRoot, normalizeRelativeResourcePath } from '../utils/path-utils.js';

function buildScopedFilePath(scope, resourcePath) {
  const normalized = normalizeRelativeResourcePath(resourcePath);
  const fullPath = path.join(scope.fileRoot, normalized);
  ensureInsideRoot(scope.fileRoot, fullPath);
  return { normalized, fullPath };
}

export async function writeScopeFile(scope, payload) {
  const { normalized, fullPath } = buildScopedFilePath(scope, payload.path);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, payload.content, payload.encoding || 'utf8');

  return {
    path: normalized,
    fullPath,
  };
}

export async function readScopeFile(scope, resourceRef) {
  const { normalized, fullPath } = buildScopedFilePath(scope, resourceRef.path);
  const content = await fs.readFile(fullPath, resourceRef.encoding || 'utf8');

  return {
    path: normalized,
    fullPath,
    content,
  };
}

export async function listScopeFiles(scope, options = {}) {
  const targetPath = options.path ? buildScopedFilePath(scope, options.path).fullPath : scope.fileRoot;
  ensureInsideRoot(scope.fileRoot, targetPath);

  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  return entries.map((entry) => ({
    name: entry.name,
    path: path.relative(scope.fileRoot, path.join(targetPath, entry.name)) || entry.name,
    type: entry.isDirectory() ? 'directory' : 'file',
  }));
}
