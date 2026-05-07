/**
 * Hetzner Cloud Server Type tools — read-only listing and details.
 */

import { z } from 'zod';
import type { ToolRegistrar } from '../server.js';
import type { CloudClient } from '../clients/cloud.js';
import type { CloudServerType } from '../types/cloud.js';

export function registerServerTypeTools(register: ToolRegistrar, cloud: CloudClient): void {
  register(
    'list_server_types',
    'List all available server types with pricing, CPU, memory, and disk information.',
    {},
    async () => {
      const serverTypes = await cloud.requestAll<CloudServerType>('/server_types', 'server_types');
      return cloud.formatOutput(serverTypes);
    },
  );

  register(
    'get_server_type',
    'Get detailed information about a specific server type by ID.',
    {
      id: z.number().describe('Server type ID'),
    },
    async (args) => {
      const result = await cloud.request<{ server_type: CloudServerType }>(`/server_types/${args.id}`);
      return cloud.formatOutput(result.server_type);
    },
  );
}
