import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('the standalone Search worker never auto-loads a dotenv credential file', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8')
  ) as { scripts?: { start?: unknown } };

  assert.equal(typeof packageJson.scripts?.start, 'string');
  assert.doesNotMatch(packageJson.scripts.start as string, /env-file|dotenv|\.env/u);
});

test('published Search paths expose no raw provider credential channel', async () => {
  const publishedPaths = [
    '../README.md',
    '../package.json',
    './types.ts',
    './research-service.ts',
    './providers/semantic-scholar.ts',
    './cli.ts',
    '../../../../src/main/research-search-mcp-server.ts'
  ];
  const forbidden = /TAVILY_API_KEY|SEMANTIC_SCHOLAR_API_KEY|tavilyApiKey|semanticScholarApiKey|x-api-key|api_key|--env-file/u;

  for (const relativePath of publishedPaths) {
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
    assert.doesNotMatch(source, forbidden, relativePath);
  }
});
