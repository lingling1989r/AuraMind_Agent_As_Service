import fs from 'node:fs/promises';
import path from 'node:path';

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function ensureScopeStorage(scope) {
  await ensureDir(scope.scopePath);
  await Promise.all([
    ensureDir(scope.fileRoot),
    ensureDir(scope.profileRoot),
    ensureDir(scope.memoryRoot),
    ensureDir(scope.transcriptRoot),
    ensureDir(scope.metadataRoot),
    ensureDir(scope.kbRoot),
  ]);

  const scopeMetaPath = path.join(scope.metadataRoot, 'scope.json');
  const routingMetaPath = path.join(scope.metadataRoot, 'routing.json');
  const now = new Date().toISOString();

  await fs.writeFile(
    scopeMetaPath,
    JSON.stringify(
      {
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        scopeHash: scope.scopeHash,
        memoryNamespace: scope.memoryNamespace,
        platform: scope.platform,
        userId: scope.userId,
        feishuUserId: scope.feishuUserId,
        sessionId: scope.sessionId,
        fileRoot: scope.fileRoot,
        profileRoot: scope.profileRoot,
        transcriptRoot: scope.transcriptRoot,
        transcriptFileName: scope.transcriptFileName,
        createdAt: now,
        updatedAt: now,
      },
      null,
      2,
    ),
    'utf8',
  );

  await fs.writeFile(
    routingMetaPath,
    JSON.stringify(
      {
        routingSource: scope.routingSource,
        transcriptRoutingSource: scope.transcriptRoutingSource,
        scopePath: scope.scopePath,
        workspacePath: scope.workspacePath,
        fileRoot: scope.fileRoot,
        profileRoot: scope.profileRoot,
        transcriptFilePath: scope.transcriptFilePath,
        agentId: scope.agentId,
        channelId: scope.channelId,
        platform: scope.platform,
        userId: scope.userId,
        feishuUserId: scope.feishuUserId,
        sessionId: scope.sessionId,
        updatedAt: now,
      },
      null,
      2,
    ),
    'utf8',
  );

  return scope;
}
