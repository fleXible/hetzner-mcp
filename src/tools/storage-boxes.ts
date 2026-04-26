/**
 * Hetzner Cloud Storage Box tools — list, get, update.
 */

import { z } from 'zod';
import type { ToolRegistrar } from '../server.js';
import type { CloudClient } from '../clients/cloud.js';
import type { CloudStorageBox } from '../types/cloud.js';

export function registerStorageBoxTools(register: ToolRegistrar, cloud: CloudClient, readOnly: boolean): void {
  // ── Read-only tools ─────────────────────────────────────────────────────

  register(
    'list_storage_boxes',
    'List all storage boxes in the Hetzner Cloud project.',
    {},
    async () => {
      const storageBoxes = await cloud.requestAll<CloudStorageBox>('/storage_boxes', 'storage_boxes');
      return cloud.formatOutput(storageBoxes);
    },
  );

  register(
    'get_storage_box',
    'Get detailed information about a specific storage box by ID.',
    {
      id: z.number().describe('Storage box ID'),
    },
    async (args) => {
      const result = await cloud.request<{ storage_box: CloudStorageBox }>(`/storage_boxes/${args.id}`);
      return cloud.formatOutput(result.storage_box);
    },
  );

  // ── Mutating tools ────────────────────────────────────────────────────

  if (!readOnly) {
    register(
      'update_storage_box',
      'Update a storage box\'s name or labels.',
      {
        id: z.number().describe('Storage box ID'),
        name: z.string().optional().describe('New name for the storage box'),
        labels: z.string().optional().describe('New labels as JSON object (e.g. {"env":"prod"})'),
      },
      async (args) => {
        const body: Record<string, unknown> = {};
        if (args.name !== undefined) body.name = args.name;
        if (args.labels !== undefined) {
          body.labels = JSON.parse(args.labels as string) as Record<string, string>;
        }

        const result = await cloud.request<{ storage_box: CloudStorageBox }>(`/storage_boxes/${args.id}`, {
          method: 'PUT',
          body,
        });
        return cloud.formatOutput(result.storage_box);
      },
    );
  }
}
