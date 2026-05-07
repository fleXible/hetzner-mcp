/**
 * hetzner-mcp — Production-grade MCP server for Hetzner Cloud, Robot & DNS APIs.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, describeConfig } from './config.js';
import { CloudClient } from './clients/cloud.js';
import { RobotClient } from './clients/robot.js';
import { registerAllTools } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();

  const readOnly = config.mode === 'read_only';

  // Create API clients based on available credentials
  const cloud = config.cloud ? new CloudClient(config.cloud) : null;
  const robot = config.robot ? new RobotClient(config.robot) : null;

  // Create MCP server
  const server = new McpServer({
    name: 'hetzner-mcp',
    version: '0.1.0',
  });

  // Register all tools
  registerAllTools(server, cloud, robot, readOnly, config.tools);

  // Log configuration (to stderr so it doesn't interfere with stdio transport)
  console.error('hetzner-mcp starting...');
  console.error(describeConfig(config));

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
