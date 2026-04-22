import fs from 'node:fs/promises';
import path from 'node:path';

function getTranscriptFilePath(scope) {
  return scope.transcriptFilePath || path.join(scope.transcriptRoot, 'messages.jsonl');
}

export async function appendTranscriptEntry(scope, entry) {
  const filePath = getTranscriptFilePath(scope);
  const line = `${JSON.stringify({ ...entry, ts: entry.ts || new Date().toISOString() })}\n`;
  await fs.mkdir(scope.transcriptRoot, { recursive: true });
  await fs.appendFile(filePath, line, 'utf8');
  return { filePath };
}

export async function readTranscript(scope) {
  const filePath = getTranscriptFilePath(scope);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}
