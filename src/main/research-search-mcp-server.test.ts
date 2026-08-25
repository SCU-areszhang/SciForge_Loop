import { describe, expect, it } from 'vitest'
import * as researchSearchMcpServer from './research-search-mcp-server'

describe('research search MCP launch boundary', () => {
  it('does not expose an env-file or dotenv parsing path', () => {
    expect(researchSearchMcpServer).not.toHaveProperty('researchSearchEnvForGuiMcp')
    expect(researchSearchMcpServer).not.toHaveProperty('resolveResearchSearchEnvFile')
    expect(researchSearchMcpServer).not.toHaveProperty('parseResearchSearchEnvFile')
  })

  it('does not start the worker without its exact launch flag', async () => {
    await expect(researchSearchMcpServer.runResearchSearchMcpServerFromArgv([])).resolves.toBe(false)
  })
})
