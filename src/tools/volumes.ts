/**
 * Hetzner Cloud Volume tools — list, get, create, update, delete, attach/detach, resize, protection.
 */

import { z } from 'zod';
import type { ToolRegistrar } from '../server.js';
import type { CloudClient } from '../clients/cloud.js';
import type { ActionResponse } from '../types/cloud.js';

export function registerVolumeTools(register: ToolRegistrar, cloud: CloudClient, readOnly: boolean): void {
  // ── Read-only tools ─────────────────────────────────────────────────────

  register(
    'list_volumes',
    'List all volumes in the project, with optional filters',
    {
      name: z.string().optional().describe('Filter by volume name'),
      label_selector: z.string().optional().describe('Filter by label selector (e.g. "env=prod")'),
      status: z.string().optional().describe('Filter by status (available, creating)'),
      sort: z.string().optional().describe('Sort results (id, id:asc, id:desc, name, name:asc, name:desc, created, created:asc, created:desc)'),
    },
    async (args) => {
      const volumes = await cloud.requestAll('/volumes', 'volumes', {
        name: args.name as string | undefined,
        label_selector: args.label_selector as string | undefined,
        status: args.status as string | undefined,
        sort: args.sort as string | undefined,
      });
      return cloud.formatOutput(volumes);
    },
  );

  register(
    'get_volume',
    'Get details of a specific volume by ID',
    {
      id: z.number().describe('Volume ID'),
    },
    async (args) => {
      const result = await cloud.request(`/volumes/${args.id}`);
      return cloud.formatOutput(result);
    },
  );

  register(
    'list_volume_actions',
    'List all actions for a specific volume',
    {
      id: z.number().describe('Volume ID'),
    },
    async (args) => {
      const actions = await cloud.requestAll(`/volumes/${args.id}/actions`, 'actions');
      return cloud.formatOutput(actions);
    },
  );

  // ── Mutating tools ──────────────────────────────────────────────────────

  if (!readOnly) {
    register(
      'create_volume',
      'Create a new volume',
      {
        name: z.string().describe('Name of the volume'),
        size: z.number().describe('Size in GB (minimum 10)'),
        location: z.string().optional().describe('Location name (e.g. "fsn1"). Required if server is not set'),
        server: z.number().optional().describe('Server ID to attach the volume to'),
        automount: z.boolean().default(false).describe('Auto-mount the volume after attaching'),
        format: z.string().optional().describe('Filesystem format (ext4, xfs). Optional'),
        labels: z.string().optional().describe('JSON object of labels (e.g. \'{"env":"prod"}\')'),
      },
      async (args) => {
        const body: Record<string, unknown> = {
          name: args.name,
          size: args.size,
        };
        if (args.location) body.location = args.location;
        if (args.server) body.server = args.server;
        if (args.automount) body.automount = args.automount;
        if (args.format) body.format = args.format;
        if (args.labels) body.labels = JSON.parse(args.labels as string);

        const result = await cloud.request<{ volume: unknown; action: { id: number } }>(
          '/volumes',
          { method: 'POST', body },
        );
        const action = await cloud.pollAction(result.action.id);
        return cloud.formatOutput({ volume: result.volume, action });
      },
    );

    register(
      'update_volume',
      'Update a volume (name and/or labels)',
      {
        id: z.number().describe('Volume ID'),
        name: z.string().optional().describe('New volume name'),
        labels: z.string().optional().describe('JSON object of labels (e.g. \'{"env":"prod"}\')'),
      },
      async (args) => {
        const body: Record<string, unknown> = {};
        if (args.name) body.name = args.name;
        if (args.labels) body.labels = JSON.parse(args.labels as string);

        const result = await cloud.request(`/volumes/${args.id}`, {
          method: 'PUT',
          body,
        });
        return cloud.formatOutput(result);
      },
    );

    register(
      'delete_volume',
      'Delete a volume permanently',
      {
        id: z.number().describe('Volume ID'),
        confirm: z.boolean().default(false).describe('Must be true to confirm deletion'),
      },
      async (args) => {
        if (!args.confirm) {
          return '⚠️ Please set confirm to true to delete this volume. This action is irreversible.';
        }
        await cloud.request(`/volumes/${args.id}`, { method: 'DELETE' });
        return cloud.appendWarning(`Volume ${args.id} deleted successfully.`);
      },
    );

    register(
      'attach_volume',
      'Attach a volume to a server',
      {
        id: z.number().describe('Volume ID'),
        server: z.number().describe('Server ID to attach the volume to'),
        automount: z.boolean().default(false).describe('Auto-mount the volume after attaching'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(
          `/volumes/${args.id}/actions/attach`,
          { method: 'POST', body: { server: args.server, automount: args.automount } },
        );
        const action = await cloud.pollAction(result.action.id);
        return cloud.formatOutput({ action });
      },
    );

    register(
      'detach_volume',
      'Detach a volume from a server',
      {
        id: z.number().describe('Volume ID'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(
          `/volumes/${args.id}/actions/detach`,
          { method: 'POST' },
        );
        const action = await cloud.pollAction(result.action.id);
        return cloud.formatOutput({ action });
      },
    );

    register(
      'resize_volume',
      'Resize a volume (can only increase size)',
      {
        id: z.number().describe('Volume ID'),
        size: z.number().describe('New size in GB (must be larger than current size)'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(
          `/volumes/${args.id}/actions/resize`,
          { method: 'POST', body: { size: args.size } },
        );
        const action = await cloud.pollAction(result.action.id);
        return cloud.formatOutput({ action });
      },
    );

    register(
      'change_volume_protection',
      'Change delete protection for a volume',
      {
        id: z.number().describe('Volume ID'),
        delete: z.boolean().describe('Enable or disable delete protection'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(
          `/volumes/${args.id}/actions/change_protection`,
          { method: 'POST', body: { delete: args.delete } },
        );
        const action = await cloud.pollAction(result.action.id);
        return cloud.formatOutput({ action });
      },
    );
  }
}
