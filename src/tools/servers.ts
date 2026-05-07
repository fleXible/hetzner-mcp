/**
 * Hetzner Cloud Server tools — CRUD + metrics.
 */

import { z } from 'zod';
import type { ToolRegistrar } from '../server.js';
import type { CloudClient } from '../clients/cloud.js';
import type { CloudServer, CloudServerType } from '../types/cloud.js';
import type { HetznerAction } from '../clients/common.js';

export function registerServerTools(register: ToolRegistrar, cloud: CloudClient, readOnly: boolean): void {
  // ── Read-only tools ─────────────────────────────────────────────────────

  register(
    'list_servers',
    'List all servers in the Hetzner Cloud project. Supports filtering by name, status, label selector, and sorting.',
    {
      name: z.string().optional().describe('Filter by server name'),
      status: z.string().optional().describe('Filter by status (running, off, initializing, etc.)'),
      label_selector: z.string().optional().describe('Label selector to filter servers (e.g. "env=prod")'),
      sort: z.string().optional().describe('Sort by field (id, name, created — add :asc or :desc)'),
    },
    async (args) => {
      const params: Record<string, string | undefined> = {
        name: args.name as string | undefined,
        status: args.status as string | undefined,
        label_selector: args.label_selector as string | undefined,
        sort: args.sort as string | undefined,
      };
      const servers = await cloud.requestAll<CloudServer>('/servers', 'servers', params);
      return cloud.formatOutput(servers);
    },
  );

  register(
    'get_server',
    'Get detailed information about a specific server by ID.',
    {
      id: z.number().describe('Server ID'),
    },
    async (args) => {
      const result = await cloud.request<{ server: CloudServer }>(`/servers/${args.id}`);
      return cloud.formatOutput(result.server);
    },
  );

  register(
    'get_server_metrics',
    'Get metrics (CPU, disk, or network) for a server over a time range.',
    {
      id: z.number().describe('Server ID'),
      type: z.string().describe('Metric type: cpu, disk, or network'),
      start: z.string().describe('Start of period in ISO 8601 format (e.g. 2024-01-01T00:00:00Z)'),
      end: z.string().describe('End of period in ISO 8601 format (e.g. 2024-01-02T00:00:00Z)'),
    },
    async (args) => {
      const result = await cloud.request<{ metrics: unknown }>(`/servers/${args.id}/metrics`, {
        params: {
          type: args.type as string,
          start: args.start as string,
          end: args.end as string,
        },
      });
      return cloud.formatOutput(result.metrics);
    },
  );

  // ── Mutating tools ────────────────────────────────────────────────────

  if (!readOnly) {
    register(
      'create_server',
      'Create a new server. Echoes estimated hourly cost before proceeding. Returns the created server and root password (if any).',
      {
        name: z.string().describe('Name of the server'),
        server_type: z.string().describe('Server type name (e.g. cx22, cpx11, cax11)'),
        image: z.string().describe('Image name or ID to use (e.g. ubuntu-22.04, debian-12)'),
        location: z.string().optional().describe('Location name (e.g. fsn1, nbg1, hel1, ash, hil)'),
        datacenter: z.string().optional().describe('Datacenter name (e.g. fsn1-dc14). Mutually exclusive with location'),
        ssh_keys: z.string().optional().describe('Comma-separated SSH key names or IDs'),
        volumes: z.string().optional().describe('Comma-separated volume IDs to attach'),
        firewalls: z.string().optional().describe('Comma-separated firewall IDs to apply'),
        networks: z.string().optional().describe('Comma-separated network IDs to attach'),
        user_data: z.string().optional().describe('Cloud-init user data'),
        labels: z.string().optional().describe('Labels as JSON object (e.g. {"env":"prod"})'),
        automount: z.boolean().default(false).describe('Auto-mount volumes after attach'),
        start_after_create: z.boolean().default(true).describe('Start server after creation'),
      },
      async (args) => {
        // Look up server type pricing
        const serverTypes = await cloud.requestAll<CloudServerType>('/server_types', 'server_types');
        const st = serverTypes.find(
          (t) => t.name === args.server_type || String(t.id) === String(args.server_type),
        );
        let costInfo = '';
        if (st && st.prices.length > 0) {
          const price = st.prices[0];
          costInfo = `Estimated cost: €${price.price_hourly.gross}/hour, €${price.price_monthly.gross}/month (${price.location}).\n`;
        }

        // Build request body
        const body: Record<string, unknown> = {
          name: args.name,
          server_type: args.server_type,
          image: args.image,
          automount: args.automount,
          start_after_create: args.start_after_create,
        };
        if (args.location) body.location = args.location;
        if (args.datacenter) body.datacenter = args.datacenter;
        if (args.user_data) body.user_data = args.user_data;

        if (args.ssh_keys) {
          body.ssh_keys = (args.ssh_keys as string).split(',').map((s) => s.trim());
        }
        if (args.volumes) {
          body.volumes = (args.volumes as string).split(',').map((s) => Number(s.trim()));
        }
        if (args.firewalls) {
          body.firewalls = (args.firewalls as string).split(',').map((s) => ({ firewall: Number(s.trim()) }));
        }
        if (args.networks) {
          body.networks = (args.networks as string).split(',').map((s) => Number(s.trim()));
        }
        if (args.labels) {
          body.labels = JSON.parse(args.labels as string) as Record<string, string>;
        }

        const result = await cloud.request<{
          server: CloudServer;
          action: HetznerAction;
          root_password: string | null;
          next_actions: HetznerAction[];
        }>('/servers', { method: 'POST', body });

        // Poll the main action
        if (result.action) {
          await cloud.pollAction(result.action.id);
        }

        return cloud.appendWarning(costInfo + JSON.stringify({
          server: result.server,
          root_password: result.root_password,
        }, null, 2));
      },
    );

    register(
      'update_server',
      'Update a server\'s name or labels.',
      {
        id: z.number().describe('Server ID'),
        name: z.string().optional().describe('New server name'),
        labels: z.string().optional().describe('New labels as JSON object (e.g. {"env":"staging"})'),
      },
      async (args) => {
        const body: Record<string, unknown> = {};
        if (args.name !== undefined) body.name = args.name;
        if (args.labels !== undefined) {
          body.labels = JSON.parse(args.labels as string) as Record<string, string>;
        }

        const result = await cloud.request<{ server: CloudServer }>(`/servers/${args.id}`, {
          method: 'PUT',
          body,
        });
        return cloud.formatOutput(result.server);
      },
    );

    register(
      'delete_server',
      'Delete a server permanently. Requires confirm=true.',
      {
        id: z.number().describe('Server ID'),
        confirm: z.boolean().default(false).describe('Must be true to confirm deletion'),
      },
      async (args) => {
        if (!args.confirm) {
          return 'Deletion not confirmed. Set confirm=true to proceed with deleting this server.';
        }
        const result = await cloud.request<{ action: HetznerAction }>(`/servers/${args.id}`, {
          method: 'DELETE',
        });
        if (result.action) {
          await cloud.pollAction(result.action.id);
        }
        return cloud.formatOutput(result);
      },
    );
  }
}
