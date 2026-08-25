import {
  createResearchSearchService,
  researchSearchConfigFromEnv
} from '../../packages/workers/search/src/research-service'
import { startResearchSearchMcpServer } from '../../packages/workers/search/src/mcp-server'

export const GUI_RESEARCH_MCP_LAUNCH_FLAG = '--gui-research-mcp-server'

export async function runResearchSearchMcpServerFromArgv(argv: string[]): Promise<boolean> {
  if (!argv.includes(GUI_RESEARCH_MCP_LAUNCH_FLAG)) return false
  const config = researchSearchConfigFromEnv()
  await startResearchSearchMcpServer(createResearchSearchService(config))
  return true
}
