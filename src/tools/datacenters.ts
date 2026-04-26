/**
 * Hetzner Cloud Datacenter tools — read-only.
 */

import { z } from 'zod';
import type { ToolRegistrar } from '../server.js';
import type { CloudClient } from '../clients/cloud.js';
import type { CloudDatacenter } from '../types/cloud.js';

export function registerDatacenterTools(register: ToolRegistrar, cloud: CloudClient): void {
  register(
    'list_datacenters',
    'List all datacenters available in Hetzner Cloud. Supports filtering by name and sorting.',
    {
      name: z.string().optional().describe('Filter by datacenter name (e.g. fsn1-dc14)'),
      sort: z.string().optional().describe('Sort by field (id, name — add :asc or :desc)'),
    },
    async (args) => {
      const params: Record<string, string | undefined> = {
        name: args.name as string | undefined,
        sort: args.sort as string | undefined,
      };
      const datacenters = await cloud.requestAll<CloudDatacenter>('/datacenters', 'datacenters', params);
      return cloud.formatOutput(datacenters);
    },
  );

  register(
    'get_datacenter',
    'Get detailed information about a specific datacenter by ID.',
    {
      id: z.number().describe('Datacenter ID'),
    },
    async (args) => {
      const result = await cloud.request<{ datacenter: CloudDatacenter }>(`/datacenters/${args.id}`);
      return cloud.formatOutput(result.datacenter);
    },
  );
}
