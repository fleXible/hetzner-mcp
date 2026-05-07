/**
 * Hetzner DNS RRSet tools — CRUD + record actions.
 * Targets Cloud API spec: /zones/{id_or_name}/rrsets and rrset actions.
 */

import { z } from 'zod';
import type { ToolRegistrar } from '../server.js';
import type { CloudClient } from '../clients/cloud.js';
import type { DnsRRSetsResponse, DnsRRSetResponse, DnsActionResponse } from '../types/dns.js';

const rrsetTypeEnum = z.enum([
  'A', 'AAAA', 'CAA', 'CNAME', 'DS', 'HINFO', 'HTTPS',
  'MX', 'NS', 'PTR', 'RP', 'SOA', 'SRV', 'SVCB', 'TLSA', 'TXT',
]);

export function registerDnsRecordTools(register: ToolRegistrar, cloud: CloudClient, readOnly: boolean): void {
  // ── Read-only tools ─────────────────────────────────────────────────────

  register(
    'list_dns_rrsets',
    'List RRSets (resource record sets) in a DNS zone. Only for primary mode zones.',
    {
      zone: z.string().describe('DNS zone ID or name'),
      name: z.string().optional().describe('Filter by exact RRSet name (e.g. "www", "@" for apex)'),
      type: z.string().optional().describe('Filter by record type (A, AAAA, CNAME, MX, TXT, etc.). Comma-separated for multiple.'),
      label_selector: z.string().optional().describe('Filter by label selector (e.g. "env=prod")'),
      sort: z.string().optional().describe('Sort field and direction (e.g. "name:asc")'),
      page: z.number().optional().describe('Page number for pagination'),
      per_page: z.number().optional().describe('Number of results per page (max 100)'),
    },
    async (args) => {
      const params: Record<string, string | number | undefined> = {
        name: args.name as string | undefined,
        type: args.type as string | undefined,
        label_selector: args.label_selector as string | undefined,
        sort: args.sort as string | undefined,
        page: args.page as number | undefined,
        per_page: args.per_page as number | undefined,
      };
      const result = await cloud.request<DnsRRSetsResponse>(`/zones/${args.zone}/rrsets`, { params });
      return cloud.formatOutput(result);
    },
  );

  register(
    'get_dns_rrset',
    'Get a specific RRSet by name and type from a DNS zone. Only for primary mode zones.',
    {
      zone: z.string().describe('DNS zone ID or name'),
      rr_name: z.string().describe('RRSet name (e.g. "www", "@" for apex)'),
      rr_type: rrsetTypeEnum.describe('RRSet type (A, AAAA, CNAME, MX, TXT, etc.)'),
    },
    async (args) => {
      const result = await cloud.request<DnsRRSetResponse>(`/zones/${args.zone}/rrsets/${args.rr_name}/${args.rr_type}`);
      return cloud.formatOutput(result.rrset);
    },
  );

  // ── Mutating tools ────────────────────────────────────────────────────

  if (!readOnly) {
    register(
      'create_dns_rrset',
      'Create a new RRSet in a DNS zone. Only for primary mode zones.',
      {
        zone: z.string().describe('DNS zone ID or name'),
        name: z.string().describe('RRSet name (e.g. "www", "@" for apex)'),
        type: rrsetTypeEnum.describe('Record type (A, AAAA, CNAME, MX, TXT, etc.)'),
        records: z.string().describe('JSON array of record objects, each with "value" (required) and optional "comment". Example: [{"value":"1.2.3.4","comment":"web server"}]'),
        ttl: z.number().optional().describe('TTL in seconds (60–2147483647). If omitted, zone default TTL is used.'),
        labels: z.string().optional().describe('JSON object of key/value label pairs (e.g. {"env":"prod"})'),
      },
      async (args) => {
        const body: Record<string, unknown> = {
          name: args.name,
          type: args.type,
          records: JSON.parse(args.records as string),
        };
        if (args.ttl !== undefined) body.ttl = args.ttl;
        if (args.labels) body.labels = JSON.parse(args.labels as string);

        const result = await cloud.request<DnsRRSetResponse>(`/zones/${args.zone}/rrsets`, {
          method: 'POST',
          body,
        });
        return cloud.formatOutput(result.rrset);
      },
    );

    register(
      'delete_dns_rrset',
      'Delete an RRSet from a DNS zone. Requires confirm=true. Only for primary mode zones.',
      {
        zone: z.string().describe('DNS zone ID or name'),
        rr_name: z.string().describe('RRSet name (e.g. "www", "@" for apex)'),
        rr_type: rrsetTypeEnum.describe('RRSet type (A, AAAA, CNAME, etc.)'),
        confirm: z.boolean().default(false).describe('Must be true to confirm deletion'),
      },
      async (args) => {
        if (!args.confirm) {
          return 'Deletion not confirmed. Set confirm=true to proceed with deleting this RRSet.';
        }
        await cloud.request(`/zones/${args.zone}/rrsets/${args.rr_name}/${args.rr_type}`, { method: 'DELETE' });
        return cloud.formatOutput({ success: true, deleted: `${args.rr_name}/${args.rr_type}` });
      },
    );

    register(
      'set_dns_rrset_records',
      'Overwrite all records of an existing RRSet. This is idempotent — sets the exact records provided. Only for primary mode zones.',
      {
        zone: z.string().describe('DNS zone ID or name'),
        rr_name: z.string().describe('RRSet name (e.g. "www", "@" for apex)'),
        rr_type: rrsetTypeEnum.describe('RRSet type (A, AAAA, CNAME, etc.)'),
        records: z.string().describe('JSON array of record objects, each with "value" (required) and optional "comment". Example: [{"value":"1.2.3.4"}]'),
      },
      async (args) => {
        const result = await cloud.request<DnsActionResponse>(
          `/zones/${args.zone}/rrsets/${args.rr_name}/${args.rr_type}/actions/set_records`,
          {
            method: 'POST',
            body: { records: JSON.parse(args.records as string) },
          },
        );
        return cloud.formatOutput(result);
      },
    );

    register(
      'add_dns_rrset_records',
      'Add records to an existing RRSet without removing existing ones. Only for primary mode zones.',
      {
        zone: z.string().describe('DNS zone ID or name'),
        rr_name: z.string().describe('RRSet name (e.g. "www", "@" for apex)'),
        rr_type: rrsetTypeEnum.describe('RRSet type (A, AAAA, CNAME, etc.)'),
        records: z.string().describe('JSON array of record objects to add, each with "value" (required) and optional "comment". Example: [{"value":"1.2.3.4"}]'),
      },
      async (args) => {
        const result = await cloud.request<DnsActionResponse>(
          `/zones/${args.zone}/rrsets/${args.rr_name}/${args.rr_type}/actions/add_records`,
          {
            method: 'POST',
            body: { records: JSON.parse(args.records as string) },
          },
        );
        return cloud.formatOutput(result);
      },
    );

    register(
      'remove_dns_rrset_records',
      'Remove specific records from an existing RRSet by value. Only for primary mode zones.',
      {
        zone: z.string().describe('DNS zone ID or name'),
        rr_name: z.string().describe('RRSet name (e.g. "www", "@" for apex)'),
        rr_type: rrsetTypeEnum.describe('RRSet type (A, AAAA, CNAME, etc.)'),
        records: z.string().describe('JSON array of record objects to remove, each with "value" (required). Example: [{"value":"1.2.3.4"}]'),
      },
      async (args) => {
        const result = await cloud.request<DnsActionResponse>(
          `/zones/${args.zone}/rrsets/${args.rr_name}/${args.rr_type}/actions/remove_records`,
          {
            method: 'POST',
            body: { records: JSON.parse(args.records as string) },
          },
        );
        return cloud.formatOutput(result);
      },
    );

    register(
      'update_dns_rrset_records',
      'Update comments on existing records in an RRSet. Both value and comment are required per record. Only for primary mode zones.',
      {
        zone: z.string().describe('DNS zone ID or name'),
        rr_name: z.string().describe('RRSet name (e.g. "www", "@" for apex)'),
        rr_type: rrsetTypeEnum.describe('RRSet type (A, AAAA, CNAME, etc.)'),
        records: z.string().describe('JSON array of record objects, each with "value" (required, identifies the record) and "comment" (required, new comment). Example: [{"value":"1.2.3.4","comment":"updated comment"}]'),
      },
      async (args) => {
        const result = await cloud.request<DnsActionResponse>(
          `/zones/${args.zone}/rrsets/${args.rr_name}/${args.rr_type}/actions/update_records`,
          {
            method: 'POST',
            body: { records: JSON.parse(args.records as string) },
          },
        );
        return cloud.formatOutput(result);
      },
    );
  }
}
