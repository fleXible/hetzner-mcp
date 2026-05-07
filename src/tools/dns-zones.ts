/**
 * Hetzner DNS Zone tools — CRUD, import/export, change TTL.
 * Targets Cloud API spec: /zones, /zones/{id_or_name}
 */

import { z } from 'zod';
import type { ToolRegistrar } from '../server.js';
import type { CloudClient } from '../clients/cloud.js';
import type {
  DnsZonesResponse,
  DnsZoneResponse,
  DnsCreateZoneResponse,
  DnsActionResponse,
  DnsZonefileResponse,
} from '../types/dns.js';

export function registerDnsZoneTools(register: ToolRegistrar, cloud: CloudClient, readOnly: boolean): void {
  // ── Read-only tools ─────────────────────────────────────────────────────

  register(
    'list_dns_zones',
    'List all DNS zones. Supports filtering by name, mode, labels, and pagination.',
    {
      name: z.string().optional().describe('Filter by exact zone name (domain)'),
      mode: z.enum(['primary', 'secondary']).optional().describe('Filter by zone mode'),
      label_selector: z.string().optional().describe('Filter by label selector (e.g. "env=prod")'),
      sort: z.string().optional().describe('Sort field and direction (e.g. "name:asc"). Options: id, name, created — each with optional :asc/:desc'),
      page: z.number().optional().describe('Page number for pagination'),
      per_page: z.number().optional().describe('Number of results per page (max 25)'),
    },
    async (args) => {
      const params: Record<string, string | number | undefined> = {
        name: args.name as string | undefined,
        mode: args.mode as string | undefined,
        label_selector: args.label_selector as string | undefined,
        sort: args.sort as string | undefined,
        page: args.page as number | undefined,
        per_page: args.per_page as number | undefined,
      };
      const result = await cloud.request<DnsZonesResponse>('/zones', { params });
      return cloud.formatOutput(result);
    },
  );

  register(
    'get_dns_zone',
    'Get detailed information about a specific DNS zone by ID or name.',
    {
      id_or_name: z.string().describe('DNS zone ID or domain name'),
    },
    async (args) => {
      const result = await cloud.request<DnsZoneResponse>(`/zones/${args.id_or_name}`);
      return cloud.formatOutput(result.zone);
    },
  );

  register(
    'export_dns_zone',
    'Export a DNS zone as a plain text zone file (BIND format). Only for primary mode zones.',
    {
      id_or_name: z.string().describe('DNS zone ID or name to export'),
    },
    async (args) => {
      const result = await cloud.request<DnsZonefileResponse>(`/zones/${args.id_or_name}/zonefile`);
      return cloud.appendWarning(result.zonefile ?? JSON.stringify(result, null, 2));
    },
  );

  // ── Mutating tools ────────────────────────────────────────────────────

  if (!readOnly) {
    register(
      'create_dns_zone',
      'Create a new DNS zone. Requires name and mode. Optionally include rrsets or a zonefile for initial records (primary mode only).',
      {
        name: z.string().describe('Domain name for the zone (e.g. example.com)'),
        mode: z.enum(['primary', 'secondary']).describe('Zone mode: primary (manage records via API) or secondary (AXFR from primary nameservers)'),
        ttl: z.number().optional().describe('Default TTL for the zone in seconds (60–2147483647, default 3600)'),
        labels: z.string().optional().describe('JSON object of key/value label pairs (e.g. {"env":"prod"})'),
        primary_nameservers: z.string().optional().describe('JSON array of primary nameserver objects for secondary mode (e.g. [{"address":"198.51.100.1","port":53}])'),
        rrsets: z.string().optional().describe('JSON array of RRSet objects for primary mode (e.g. [{"name":"www","type":"A","records":[{"value":"1.2.3.4"}]}])'),
        zonefile: z.string().optional().describe('Zone file content (BIND format) for primary mode. If provided, rrsets must be empty.'),
      },
      async (args) => {
        const body: Record<string, unknown> = {
          name: args.name,
          mode: args.mode,
        };
        if (args.ttl !== undefined) body.ttl = args.ttl;
        if (args.labels) body.labels = JSON.parse(args.labels as string);
        if (args.primary_nameservers) body.primary_nameservers = JSON.parse(args.primary_nameservers as string);
        if (args.rrsets) body.rrsets = JSON.parse(args.rrsets as string);
        if (args.zonefile) body.zonefile = args.zonefile;

        const result = await cloud.request<DnsCreateZoneResponse>('/zones', {
          method: 'POST',
          body,
        });

        // Poll the action to completion
        if (result.action?.id) {
          await cloud.pollAction(result.action.id);
        }

        return cloud.formatOutput(result.zone);
      },
    );

    register(
      'update_dns_zone',
      'Update a DNS zone\'s labels. To change TTL, use change_dns_zone_ttl. To modify records, use RRSet tools.',
      {
        id_or_name: z.string().describe('DNS zone ID or name'),
        labels: z.string().describe('JSON object of key/value label pairs. Overwrites all existing labels. Use {} to clear.'),
      },
      async (args) => {
        const body: Record<string, unknown> = {
          labels: JSON.parse(args.labels as string),
        };

        const result = await cloud.request<DnsZoneResponse>(`/zones/${args.id_or_name}`, {
          method: 'PUT',
          body,
        });
        return cloud.formatOutput(result.zone);
      },
    );

    register(
      'delete_dns_zone',
      'Delete a DNS zone permanently. Requires confirm=true. This is an async operation.',
      {
        id_or_name: z.string().describe('DNS zone ID or name to delete'),
        confirm: z.boolean().default(false).describe('Must be true to confirm deletion'),
      },
      async (args) => {
        if (!args.confirm) {
          return 'Deletion not confirmed. Set confirm=true to proceed with deleting this DNS zone and all its records.';
        }
        const result = await cloud.request<DnsActionResponse>(`/zones/${args.id_or_name}`, { method: 'DELETE' });

        // Poll action to completion
        if (result.action?.id) {
          const action = await cloud.pollAction(result.action.id);
          return cloud.formatOutput({ success: true, action });
        }

        return cloud.formatOutput({ success: true });
      },
    );

    register(
      'change_dns_zone_ttl',
      'Change the default TTL of a DNS zone. Only for primary mode zones.',
      {
        id_or_name: z.string().describe('DNS zone ID or name'),
        ttl: z.number().describe('New default TTL in seconds (60–2147483647)'),
      },
      async (args) => {
        const result = await cloud.request<DnsActionResponse>(`/zones/${args.id_or_name}/actions/change_ttl`, {
          method: 'POST',
          body: { ttl: args.ttl },
        });

        if (result.action?.id) {
          const action = await cloud.pollAction(result.action.id);
          return cloud.formatOutput({ success: true, action });
        }

        return cloud.formatOutput(result);
      },
    );

    register(
      'import_dns_zone',
      'Import DNS records into a zone from a zone file (BIND format). Replaces all existing RRSets. Only for primary mode zones.',
      {
        id_or_name: z.string().describe('DNS zone ID or name to import records into'),
        zonefile: z.string().describe('Zone file content in BIND format to import'),
      },
      async (args) => {
        const result = await cloud.request<DnsActionResponse>(`/zones/${args.id_or_name}/actions/import_zonefile`, {
          method: 'POST',
          body: { zonefile: args.zonefile },
        });

        if (result.action?.id) {
          const action = await cloud.pollAction(result.action.id);
          return cloud.formatOutput({ success: true, action });
        }

        return cloud.formatOutput(result);
      },
    );
  }
}
