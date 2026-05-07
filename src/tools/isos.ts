/**
 * Hetzner Cloud ISO tools — read-only listing and details.
 */

import { z } from 'zod';
import type { ToolRegistrar } from '../server.js';
import type { CloudClient } from '../clients/cloud.js';
import type { CloudISO } from '../types/cloud.js';

export function registerIsoTools(register: ToolRegistrar, cloud: CloudClient): void {
  register(
    'list_isos',
    'List all available ISO images. Supports filtering by name and architecture.',
    {
      name: z.string().optional().describe('Filter by ISO name'),
      architecture: z.string().optional().describe('Filter by architecture: x86 or arm'),
    },
    async (args) => {
      const params: Record<string, string | undefined> = {
        name: args.name as string | undefined,
        architecture: args.architecture as string | undefined,
      };
      const isos = await cloud.requestAll<CloudISO>('/isos', 'isos', params);
      return cloud.formatOutput(isos);
    },
  );

  register(
    'get_iso',
    'Get detailed information about a specific ISO image by ID.',
    {
      id: z.number().describe('ISO ID'),
    },
    async (args) => {
      const result = await cloud.request<{ iso: CloudISO }>(`/isos/${args.id}`);
      return cloud.formatOutput(result.iso);
    },
  );
}
