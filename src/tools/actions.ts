/**
 * Hetzner Cloud Action tools — read-only.
 */

import { z } from 'zod';
import type { ToolRegistrar } from '../server.js';
import type { CloudClient } from '../clients/cloud.js';
import type { HetznerAction } from '../clients/common.js';

export function registerActionTools(register: ToolRegistrar, cloud: CloudClient): void {
  // NOTE: list_actions removed — Hetzner deprecated the global /actions endpoint (410 Gone)
  // See: https://docs.hetzner.cloud/changelog#2025-01-30

  register(
    'get_action',
    'Get detailed information about a specific action by ID. Useful for checking the status of async operations.',
    {
      id: z.number().describe('Action ID'),
    },
    async (args) => {
      const result = await cloud.request<{ action: HetznerAction }>(`/actions/${args.id}`);
      return cloud.formatOutput(result.action);
    },
  );
}
