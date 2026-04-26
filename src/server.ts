/**
 * MCP Server setup — tool registration wrapper and wiring.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CloudClient } from './clients/cloud.js';
import type { RobotClient } from './clients/robot.js';
import { formatError } from './clients/common.js';
import type { ToolGroup } from './config.js';

// ── ToolRegistrar ───────────────────────────────────────────────────────────

/**
 * Simplified tool registration callback used by all tool files.
 * Wraps the MCP SDK's `server.tool()` with error handling.
 */
export type ToolRegistrar = (
  name: string,
  description: string,
  params: Record<string, z.ZodTypeAny>,
  handler: (args: Record<string, unknown>) => Promise<string>,
) => void;

/**
 * Creates a ToolRegistrar that wraps each handler with try/catch formatting.
 */
export function createRegistrar(server: McpServer): ToolRegistrar {
  return (name, description, params, handler) => {
    server.tool(name, description, params, async (args) => {
      try {
        const text = await handler(args);
        return { content: [{ type: 'text' as const, text }] };
      } catch (error) {
        return {
          content: [{ type: 'text' as const, text: formatError(error) }],
          isError: true,
        };
      }
    });
  };
}

// ── Tool Registration ───────────────────────────────────────────────────────

// Cloud tool registrations
import { registerServerTools } from './tools/servers.js';
import { registerServerActionTools } from './tools/server-actions.js';
import { registerServerTypeTools } from './tools/server-types.js';
import { registerImageTools } from './tools/images.js';
import { registerIsoTools } from './tools/isos.js';
import { registerVolumeTools } from './tools/volumes.js';
import { registerNetworkTools } from './tools/networks.js';
import { registerFirewallTools } from './tools/firewalls.js';
import { registerFloatingIpTools } from './tools/floating-ips.js';
import { registerPrimaryIpTools } from './tools/primary-ips.js';
import { registerLoadBalancerTools } from './tools/load-balancers.js';
import { registerLoadBalancerTypeTools } from './tools/load-balancer-types.js';
import { registerCertificateTools } from './tools/certificates.js';
import { registerSshKeyTools } from './tools/ssh-keys.js';
import { registerPlacementGroupTools } from './tools/placement-groups.js';
import { registerDatacenterTools } from './tools/datacenters.js';
import { registerLocationTools } from './tools/locations.js';
import { registerPricingTools } from './tools/pricing.js';
import { registerActionTools } from './tools/actions.js';

// DNS tool registrations
import { registerDnsZoneTools } from './tools/dns-zones.js';
import { registerDnsRecordTools } from './tools/dns-records.js';

// Robot tool registrations
import { registerRobotServerTools } from './tools/robot-servers.js';
import { registerRobotResetTools } from './tools/robot-reset.js';
import { registerRobotWolTools } from './tools/robot-wol.js';
import { registerRobotBootTools } from './tools/robot-boot.js';
import { registerRobotKeyTools } from './tools/robot-keys.js';
import { registerRobotIpTools } from './tools/robot-ips.js';
import { registerRobotSubnetTools } from './tools/robot-subnets.js';
import { registerRobotFirewallTools } from './tools/robot-firewalls.js';
import { registerRobotVswitchTools } from './tools/robot-vswitch.js';
import { registerRobotRdnsTools } from './tools/robot-rdns.js';
import { registerRobotTrafficTools } from './tools/robot-traffic.js';
import { registerRobotFailoverTools } from './tools/robot-failover.js';

export function registerAllTools(
  server: McpServer,
  cloud: CloudClient | null,
  robot: RobotClient | null,
  readOnly: boolean,
  enabledGroups: Set<ToolGroup>,
): void {
  const register = createRegistrar(server);

  // ── Cloud tools ────────────────────────────────────────────────────────
  if (cloud && enabledGroups.has('cloud')) {
    registerServerTools(register, cloud, readOnly);
    registerServerActionTools(register, cloud, readOnly);
    registerServerTypeTools(register, cloud);
    registerImageTools(register, cloud, readOnly);
    registerIsoTools(register, cloud);
    registerVolumeTools(register, cloud, readOnly);
    registerNetworkTools(register, cloud, readOnly);
    registerFirewallTools(register, cloud, readOnly);
    registerFloatingIpTools(register, cloud, readOnly);
    registerPrimaryIpTools(register, cloud, readOnly);
    registerLoadBalancerTools(register, cloud, readOnly);
    registerLoadBalancerTypeTools(register, cloud);
    registerCertificateTools(register, cloud, readOnly);
    registerSshKeyTools(register, cloud, readOnly);
    registerPlacementGroupTools(register, cloud, readOnly);
    registerDatacenterTools(register, cloud);
    registerLocationTools(register, cloud);
    registerPricingTools(register, cloud);
    registerActionTools(register, cloud);
  }

  // ── DNS tools ──────────────────────────────────────────────────────────
  if (cloud && enabledGroups.has('dns')) {
    registerDnsZoneTools(register, cloud, readOnly);
    registerDnsRecordTools(register, cloud, readOnly);
  }

  // ── Robot tools ────────────────────────────────────────────────────────
  if (robot && enabledGroups.has('robot')) {
    registerRobotServerTools(register, robot, readOnly);
    registerRobotResetTools(register, robot, readOnly);
    registerRobotWolTools(register, robot, readOnly);
    registerRobotBootTools(register, robot, readOnly);
    registerRobotKeyTools(register, robot, readOnly);
    registerRobotIpTools(register, robot, readOnly);
    registerRobotSubnetTools(register, robot, readOnly);
    registerRobotFirewallTools(register, robot, readOnly);
    registerRobotVswitchTools(register, robot, readOnly);
    registerRobotRdnsTools(register, robot, readOnly);
    registerRobotTrafficTools(register, robot);
    registerRobotFailoverTools(register, robot, readOnly);
  }
}
