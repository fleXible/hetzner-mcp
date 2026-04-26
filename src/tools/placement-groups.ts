/**
 * Hetzner Cloud Placement Group tools — CRUD.
 */

import { z } from 'zod';
import type { ToolRegistrar } from '../server.js';
import type { CloudClient } from '../clients/cloud.js';
import type { CloudPlacementGroup } from '../types/cloud.js';

export function registerPlacementGroupTools(register: ToolRegistrar, cloud: CloudClient, readOnly: boolean): void {
  // ── Read-only tools ─────────────────────────────────────────────────────

  register(
    'list_placement_groups',
    'List all placement groups in the Hetzner Cloud project. Supports filtering by name, label selector, type, and sorting.',
    {
      name: z.string().optional().describe('Filter by placement group name'),
      label_selector: z.string().optional().describe('Label selector to filter (e.g. "env=prod")'),
      type: z.string().optional().describe('Filter by placement group type (e.g. "spread")'),
      sort: z.string().optional().describe('Sort by field (id, name, created — add :asc or :desc)'),
    },
    async (args) => {
      const params: Record<string, string | undefined> = {
        name: args.name as string | undefined,
        label_selector: args.label_selector as string | undefined,
        type: args.type as string | undefined,
        sort: args.sort as string | undefined,
      };
      const groups = await cloud.requestAll<CloudPlacementGroup>('/placement_groups', 'placement_groups', params);
      return cloud.formatOutput(groups);
    },
  );

  register(
    'get_placement_group',
    'Get detailed information about a specific placement group by ID.',
    {
      id: z.number().describe('Placement group ID'),
    },
    async (args) => {
      const result = await cloud.request<{ placement_group: CloudPlacementGroup }>(`/placement_groups/${args.id}`);
      return cloud.formatOutput(result.placement_group);
    },
  );

  // ── Mutating tools ────────────────────────────────────────────────────

  if (!readOnly) {
    register(
      'create_placement_group',
      'Create a new placement group. Servers in the same spread group are scheduled on different hosts.',
      {
        name: z.string().describe('Name of the placement group'),
        type: z.string().describe('Placement group type (currently only "spread" is available)'),
        labels: z.string().optional().describe('Labels as JSON object (e.g. {"env":"prod"})'),
      },
      async (args) => {
        const body: Record<string, unknown> = {
          name: args.name,
          type: args.type,
        };
        if (args.labels) {
          body.labels = JSON.parse(args.labels as string) as Record<string, string>;
        }

        const result = await cloud.request<{ placement_group: CloudPlacementGroup }>('/placement_groups', {
          method: 'POST',
          body,
        });
        return cloud.formatOutput(result.placement_group);
      },
    );

    register(
      'update_placement_group',
      'Update a placement group\'s name or labels.',
      {
        id: z.number().describe('Placement group ID'),
        name: z.string().optional().describe('New placement group name'),
        labels: z.string().optional().describe('New labels as JSON object (e.g. {"env":"staging"})'),
      },
      async (args) => {
        const body: Record<string, unknown> = {};
        if (args.name !== undefined) body.name = args.name;
        if (args.labels !== undefined) {
          body.labels = JSON.parse(args.labels as string) as Record<string, string>;
        }

        const result = await cloud.request<{ placement_group: CloudPlacementGroup }>(`/placement_groups/${args.id}`, {
          method: 'PUT',
          body,
        });
        return cloud.formatOutput(result.placement_group);
      },
    );

    register(
      'delete_placement_group',
      'Delete a placement group permanently. Requires confirm=true.',
      {
        id: z.number().describe('Placement group ID'),
        confirm: z.boolean().default(false).describe('Must be true to confirm deletion'),
      },
      async (args) => {
        if (!args.confirm) {
          return 'Deletion not confirmed. Set confirm=true to proceed with deleting this placement group.';
        }
        const result = await cloud.request<Record<string, unknown>>(`/placement_groups/${args.id}`, {
          method: 'DELETE',
        });
        return cloud.formatOutput(result);
      },
    );
  }
}
