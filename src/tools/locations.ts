/**
 * Hetzner Cloud Location tools — read-only.
 */

import { z } from 'zod';
import type { ToolRegistrar } from '../server.js';
import type { CloudClient } from '../clients/cloud.js';
import type { CloudLocation } from '../types/cloud.js';

export function registerLocationTools(register: ToolRegistrar, cloud: CloudClient): void {
  register(
    'list_locations',
    'List all locations available in Hetzner Cloud. Supports filtering by name and sorting.',
    {
      name: z.string().optional().describe('Filter by location name (e.g. fsn1, nbg1, hel1, ash, hil)'),
      sort: z.string().optional().describe('Sort by field (id, name — add :asc or :desc)'),
    },
    async (args) => {
      const params: Record<string, string | undefined> = {
        name: args.name as string | undefined,
        sort: args.sort as string | undefined,
      };
      const locations = await cloud.requestAll<CloudLocation>('/locations', 'locations', params);
      return cloud.formatOutput(locations);
    },
  );

  register(
    'get_location',
    'Get detailed information about a specific location by ID.',
    {
      id: z.number().describe('Location ID'),
    },
    async (args) => {
      const result = await cloud.request<{ location: CloudLocation }>(`/locations/${args.id}`);
      return cloud.formatOutput(result.location);
    },
  );
}
