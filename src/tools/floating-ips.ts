/**
 * Hetzner Cloud Floating IP tools — list, get, create, update, delete, assign/unassign, DNS, protection.
 */

import { z } from 'zod';
import type { ToolRegistrar } from '../server.js';
import type { CloudClient } from '../clients/cloud.js';
import type { ActionResponse } from '../types/cloud.js';

export function registerFloatingIpTools(register: ToolRegistrar, cloud: CloudClient, readOnly: boolean): void {
  // ── Read-only tools ─────────────────────────────────────────────────────

  register(
    'list_floating_ips',
    'List all floating IPs in the project, with optional filters',
    {
      name: z.string().optional().describe('Filter by floating IP name'),
      label_selector: z.string().optional().describe('Filter by label selector (e.g. "env=prod")'),
      sort: z.string().optional().describe('Sort results (id, id:asc, id:desc, created, created:asc, created:desc)'),
    },
    async (args) => {
      const floatingIps = await cloud.requestAll('/floating_ips', 'floating_ips', {
        name: args.name as string | undefined,
        label_selector: args.label_selector as string | undefined,
        sort: args.sort as string | undefined,
      });
      return cloud.formatOutput(floatingIps);
    },
  );

  register(
    'get_floating_ip',
    'Get details of a specific floating IP by ID',
    {
      id: z.number().describe('Floating IP ID'),
    },
    async (args) => {
      const result = await cloud.request(`/floating_ips/${args.id}`);
      return cloud.formatOutput(result);
    },
  );

  register(
    'list_floating_ip_actions',
    'List all actions for a specific floating IP',
    {
      id: z.number().describe('Floating IP ID'),
    },
    async (args) => {
      const actions = await cloud.requestAll(`/floating_ips/${args.id}/actions`, 'actions');
      return cloud.formatOutput(actions);
    },
  );

  // ── Mutating tools ──────────────────────────────────────────────────────

  if (!readOnly) {
    register(
      'create_floating_ip',
      'Create a new floating IP',
      {
        type: z.string().describe('IP type: "ipv4" or "ipv6"'),
        name: z.string().optional().describe('Name of the floating IP'),
        description: z.string().optional().describe('Description of the floating IP'),
        home_location: z.string().optional().describe('Home location name (e.g. "fsn1"). Required if server is not set'),
        server: z.number().optional().describe('Server ID to assign the floating IP to'),
        labels: z.string().optional().describe('JSON object of labels (e.g. \'{"env":"prod"}\')'),
      },
      async (args) => {
        const body: Record<string, unknown> = { type: args.type };
        if (args.name) body.name = args.name;
        if (args.description) body.description = args.description;
        if (args.home_location) body.home_location = args.home_location;
        if (args.server) body.server = args.server;
        if (args.labels) body.labels = JSON.parse(args.labels as string);

        const result = await cloud.request<{ floating_ip: unknown; action: { id: number } }>(
          '/floating_ips',
          { method: 'POST', body },
        );
        const action = await cloud.pollAction(result.action.id);
        return cloud.formatOutput({ floating_ip: result.floating_ip, action });
      },
    );

    register(
      'update_floating_ip',
      'Update a floating IP (name, description, and/or labels)',
      {
        id: z.number().describe('Floating IP ID'),
        name: z.string().optional().describe('New name'),
        description: z.string().optional().describe('New description'),
        labels: z.string().optional().describe('JSON object of labels (e.g. \'{"env":"prod"}\')'),
      },
      async (args) => {
        const body: Record<string, unknown> = {};
        if (args.name) body.name = args.name;
        if (args.description) body.description = args.description;
        if (args.labels) body.labels = JSON.parse(args.labels as string);

        const result = await cloud.request(`/floating_ips/${args.id}`, {
          method: 'PUT',
          body,
        });
        return cloud.formatOutput(result);
      },
    );

    register(
      'delete_floating_ip',
      'Delete a floating IP permanently',
      {
        id: z.number().describe('Floating IP ID'),
        confirm: z.boolean().default(false).describe('Must be true to confirm deletion'),
      },
      async (args) => {
        if (!args.confirm) {
          return '⚠️ Please set confirm to true to delete this floating IP. This action is irreversible.';
        }
        await cloud.request(`/floating_ips/${args.id}`, { method: 'DELETE' });
        return cloud.appendWarning(`Floating IP ${args.id} deleted successfully.`);
      },
    );

    register(
      'assign_floating_ip',
      'Assign a floating IP to a server',
      {
        id: z.number().describe('Floating IP ID'),
        server: z.number().describe('Server ID to assign the floating IP to'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(
          `/floating_ips/${args.id}/actions/assign`,
          { method: 'POST', body: { server: args.server } },
        );
        const action = await cloud.pollAction(result.action.id);
        return cloud.formatOutput({ action });
      },
    );

    register(
      'unassign_floating_ip',
      'Unassign a floating IP from a server',
      {
        id: z.number().describe('Floating IP ID'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(
          `/floating_ips/${args.id}/actions/unassign`,
          { method: 'POST' },
        );
        const action = await cloud.pollAction(result.action.id);
        return cloud.formatOutput({ action });
      },
    );

    register(
      'change_floating_ip_dns_ptr',
      'Change reverse DNS entry for a floating IP',
      {
        id: z.number().describe('Floating IP ID'),
        ip: z.string().describe('IP address to set the reverse DNS entry for'),
        dns_ptr: z.string().describe('Hostname to set as reverse DNS PTR record (or empty string to reset)'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(
          `/floating_ips/${args.id}/actions/change_dns_ptr`,
          { method: 'POST', body: { ip: args.ip, dns_ptr: args.dns_ptr } },
        );
        const action = await cloud.pollAction(result.action.id);
        return cloud.formatOutput({ action });
      },
    );

    register(
      'change_floating_ip_protection',
      'Change delete protection for a floating IP',
      {
        id: z.number().describe('Floating IP ID'),
        delete: z.boolean().describe('Enable or disable delete protection'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(
          `/floating_ips/${args.id}/actions/change_protection`,
          { method: 'POST', body: { delete: args.delete } },
        );
        const action = await cloud.pollAction(result.action.id);
        return cloud.formatOutput({ action });
      },
    );
  }
}
