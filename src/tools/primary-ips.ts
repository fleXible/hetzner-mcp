/**
 * Hetzner Cloud Primary IP tools — list, get, create, update, delete, assign/unassign, DNS, protection.
 */

import { z } from 'zod';
import type { ToolRegistrar } from '../server.js';
import type { CloudClient } from '../clients/cloud.js';
import type { ActionResponse } from '../types/cloud.js';

export function registerPrimaryIpTools(register: ToolRegistrar, cloud: CloudClient, readOnly: boolean): void {
  // ── Read-only tools ─────────────────────────────────────────────────────

  register(
    'list_primary_ips',
    'List all primary IPs in the project, with optional filters',
    {
      name: z.string().optional().describe('Filter by primary IP name'),
      label_selector: z.string().optional().describe('Filter by label selector (e.g. "env=prod")'),
      ip: z.string().optional().describe('Filter by IP address'),
      sort: z.string().optional().describe('Sort results (id, id:asc, id:desc, created, created:asc, created:desc)'),
    },
    async (args) => {
      const primaryIps = await cloud.requestAll('/primary_ips', 'primary_ips', {
        name: args.name as string | undefined,
        label_selector: args.label_selector as string | undefined,
        ip: args.ip as string | undefined,
        sort: args.sort as string | undefined,
      });
      return cloud.formatOutput(primaryIps);
    },
  );

  register(
    'get_primary_ip',
    'Get details of a specific primary IP by ID',
    {
      id: z.number().describe('Primary IP ID'),
    },
    async (args) => {
      const result = await cloud.request(`/primary_ips/${args.id}`);
      return cloud.formatOutput(result);
    },
  );

  // ── Mutating tools ──────────────────────────────────────────────────────

  if (!readOnly) {
    register(
      'create_primary_ip',
      'Create a new primary IP',
      {
        name: z.string().describe('Name of the primary IP'),
        type: z.string().describe('IP type: "ipv4" or "ipv6"'),
        assignee_type: z.string().describe('Assignee type (currently only "server")'),
        assignee_id: z.number().optional().describe('Server ID to assign the primary IP to'),
        auto_delete: z.boolean().default(false).describe('Delete the primary IP when the assignee is deleted'),
        datacenter: z.string().optional().describe('Datacenter name (e.g. "fsn1-dc14"). Required if assignee_id is not set'),
        labels: z.string().optional().describe('JSON object of labels (e.g. \'{"env":"prod"}\')'),
      },
      async (args) => {
        const body: Record<string, unknown> = {
          name: args.name,
          type: args.type,
          assignee_type: args.assignee_type,
          auto_delete: args.auto_delete,
        };
        if (args.assignee_id) body.assignee_id = args.assignee_id;
        if (args.datacenter) body.datacenter = args.datacenter;
        if (args.labels) body.labels = JSON.parse(args.labels as string);

        const result = await cloud.request('/primary_ips', { method: 'POST', body });
        return cloud.formatOutput(result);
      },
    );

    register(
      'update_primary_ip',
      'Update a primary IP (name, auto_delete, and/or labels)',
      {
        id: z.number().describe('Primary IP ID'),
        name: z.string().optional().describe('New name'),
        auto_delete: z.boolean().optional().describe('Delete the primary IP when the assignee is deleted'),
        labels: z.string().optional().describe('JSON object of labels (e.g. \'{"env":"prod"}\')'),
      },
      async (args) => {
        const body: Record<string, unknown> = {};
        if (args.name) body.name = args.name;
        if (args.auto_delete !== undefined) body.auto_delete = args.auto_delete;
        if (args.labels) body.labels = JSON.parse(args.labels as string);

        const result = await cloud.request(`/primary_ips/${args.id}`, {
          method: 'PUT',
          body,
        });
        return cloud.formatOutput(result);
      },
    );

    register(
      'delete_primary_ip',
      'Delete a primary IP permanently',
      {
        id: z.number().describe('Primary IP ID'),
        confirm: z.boolean().default(false).describe('Must be true to confirm deletion'),
      },
      async (args) => {
        if (!args.confirm) {
          return '⚠️ Please set confirm to true to delete this primary IP. This action is irreversible.';
        }
        await cloud.request(`/primary_ips/${args.id}`, { method: 'DELETE' });
        return cloud.appendWarning(`Primary IP ${args.id} deleted successfully.`);
      },
    );

    register(
      'assign_primary_ip',
      'Assign a primary IP to a server',
      {
        id: z.number().describe('Primary IP ID'),
        assignee_id: z.number().describe('Server ID to assign the primary IP to'),
        assignee_type: z.string().describe('Assignee type (currently only "server")'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(
          `/primary_ips/${args.id}/actions/assign`,
          { method: 'POST', body: { assignee_id: args.assignee_id, assignee_type: args.assignee_type } },
        );
        const action = await cloud.pollAction(result.action.id);
        return cloud.formatOutput({ action });
      },
    );

    register(
      'unassign_primary_ip',
      'Unassign a primary IP from a server',
      {
        id: z.number().describe('Primary IP ID'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(
          `/primary_ips/${args.id}/actions/unassign`,
          { method: 'POST' },
        );
        const action = await cloud.pollAction(result.action.id);
        return cloud.formatOutput({ action });
      },
    );

    register(
      'change_primary_ip_dns_ptr',
      'Change reverse DNS entry for a primary IP',
      {
        id: z.number().describe('Primary IP ID'),
        ip: z.string().describe('IP address to set the reverse DNS entry for'),
        dns_ptr: z.string().describe('Hostname to set as reverse DNS PTR record (or empty string to reset)'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(
          `/primary_ips/${args.id}/actions/change_dns_ptr`,
          { method: 'POST', body: { ip: args.ip, dns_ptr: args.dns_ptr } },
        );
        const action = await cloud.pollAction(result.action.id);
        return cloud.formatOutput({ action });
      },
    );

    register(
      'change_primary_ip_protection',
      'Change delete protection for a primary IP',
      {
        id: z.number().describe('Primary IP ID'),
        delete: z.boolean().describe('Enable or disable delete protection'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(
          `/primary_ips/${args.id}/actions/change_protection`,
          { method: 'POST', body: { delete: args.delete } },
        );
        const action = await cloud.pollAction(result.action.id);
        return cloud.formatOutput({ action });
      },
    );
  }
}
