/**
 * Hetzner Cloud Image tools — list, get, update, delete, and protection.
 */

import { z } from 'zod';
import type { ToolRegistrar } from '../server.js';
import type { CloudClient } from '../clients/cloud.js';
import type { CloudImage } from '../types/cloud.js';
import type { HetznerAction } from '../clients/common.js';
import type { ActionResponse } from '../types/cloud.js';

export function registerImageTools(register: ToolRegistrar, cloud: CloudClient, readOnly: boolean): void {
  // ── Read-only tools ─────────────────────────────────────────────────────

  register(
    'list_images',
    'List all images (system, snapshot, backup, app). Supports filtering by type, status, name, label selector, and architecture.',
    {
      type: z.string().optional().describe('Filter by image type: system, snapshot, backup, or app'),
      status: z.string().optional().describe('Filter by status: available or creating'),
      sort: z.string().optional().describe('Sort by field (id, name, created — add :asc or :desc)'),
      name: z.string().optional().describe('Filter by image name'),
      label_selector: z.string().optional().describe('Label selector to filter images (e.g. "env=prod")'),
      architecture: z.string().optional().describe('Filter by architecture: x86 or arm'),
    },
    async (args) => {
      const params: Record<string, string | undefined> = {
        type: args.type as string | undefined,
        status: args.status as string | undefined,
        sort: args.sort as string | undefined,
        name: args.name as string | undefined,
        label_selector: args.label_selector as string | undefined,
        architecture: args.architecture as string | undefined,
      };
      const images = await cloud.requestAll<CloudImage>('/images', 'images', params);
      return cloud.formatOutput(images);
    },
  );

  register(
    'get_image',
    'Get detailed information about a specific image by ID.',
    {
      id: z.number().describe('Image ID'),
    },
    async (args) => {
      const result = await cloud.request<{ image: CloudImage }>(`/images/${args.id}`);
      return cloud.formatOutput(result.image);
    },
  );

  register(
    'list_image_actions',
    'List all actions for a specific image.',
    {
      id: z.number().describe('Image ID'),
    },
    async (args) => {
      const actions = await cloud.requestAll<HetznerAction>(`/images/${args.id}/actions`, 'actions');
      return cloud.formatOutput(actions);
    },
  );

  // ── Mutating tools ────────────────────────────────────────────────────

  if (!readOnly) {
    register(
      'update_image',
      'Update an image\'s description, type, or labels.',
      {
        id: z.number().describe('Image ID'),
        description: z.string().optional().describe('New description for the image'),
        type: z.string().optional().describe('New image type: snapshot'),
        labels: z.string().optional().describe('New labels as JSON object (e.g. {"env":"prod"})'),
      },
      async (args) => {
        const body: Record<string, unknown> = {};
        if (args.description !== undefined) body.description = args.description;
        if (args.type !== undefined) body.type = args.type;
        if (args.labels !== undefined) {
          body.labels = JSON.parse(args.labels as string) as Record<string, string>;
        }

        const result = await cloud.request<{ image: CloudImage }>(`/images/${args.id}`, {
          method: 'PUT',
          body,
        });
        return cloud.formatOutput(result.image);
      },
    );

    register(
      'delete_image',
      'Delete an image permanently. Requires confirm=true. Only snapshot and backup images can be deleted.',
      {
        id: z.number().describe('Image ID'),
        confirm: z.boolean().default(false).describe('Must be true to confirm deletion'),
      },
      async (args) => {
        if (!args.confirm) {
          return 'Deletion not confirmed. Set confirm=true to proceed with deleting this image.';
        }
        await cloud.request(`/images/${args.id}`, { method: 'DELETE' });
        return cloud.formatOutput({ deleted: true, id: args.id });
      },
    );

    register(
      'change_image_protection',
      'Change delete protection for an image.',
      {
        id: z.number().describe('Image ID'),
        delete_protection: z.boolean().describe('Enable or disable delete protection'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(`/images/${args.id}/actions/change_protection`, {
          method: 'POST',
          body: { delete: args.delete_protection },
        });
        await cloud.pollAction(result.action.id);
        return cloud.formatOutput(result.action);
      },
    );
  }
}
