/**
 * Hetzner Cloud Firewall tools — list, get, create, update, delete, rules, apply/remove resources.
 */

import { z } from 'zod';
import type { ToolRegistrar } from '../server.js';
import type { CloudClient } from '../clients/cloud.js';
import type { ActionsResponse } from '../types/cloud.js';

export function registerFirewallTools(register: ToolRegistrar, cloud: CloudClient, readOnly: boolean): void {
  // ── Read-only tools ─────────────────────────────────────────────────────

  register(
    'list_firewalls',
    'List all firewalls in the project, with optional filters',
    {
      name: z.string().optional().describe('Filter by firewall name'),
      label_selector: z.string().optional().describe('Filter by label selector (e.g. "env=prod")'),
      sort: z.string().optional().describe('Sort results (id, id:asc, id:desc, name, name:asc, name:desc, created, created:asc, created:desc)'),
    },
    async (args) => {
      const firewalls = await cloud.requestAll('/firewalls', 'firewalls', {
        name: args.name as string | undefined,
        label_selector: args.label_selector as string | undefined,
        sort: args.sort as string | undefined,
      });
      return cloud.formatOutput(firewalls);
    },
  );

  register(
    'get_firewall',
    'Get details of a specific firewall by ID',
    {
      id: z.number().describe('Firewall ID'),
    },
    async (args) => {
      const result = await cloud.request(`/firewalls/${args.id}`);
      return cloud.formatOutput(result);
    },
  );

  register(
    'list_firewall_actions',
    'List all actions for a specific firewall',
    {
      id: z.number().describe('Firewall ID'),
    },
    async (args) => {
      const actions = await cloud.requestAll(`/firewalls/${args.id}/actions`, 'actions');
      return cloud.formatOutput(actions);
    },
  );

  // ── Mutating tools ──────────────────────────────────────────────────────

  if (!readOnly) {
    register(
      'create_firewall',
      'Create a new firewall',
      {
        name: z.string().describe('Name of the firewall'),
        rules: z.string().optional().describe('JSON array of firewall rules (e.g. \'[{"direction":"in","protocol":"tcp","port":"80","source_ips":["0.0.0.0/0","::/0"]}]\')'),
        apply_to: z.string().optional().describe('JSON array of resources to apply to (e.g. \'[{"type":"server","server":{"id":123}}]\')'),
        labels: z.string().optional().describe('JSON object of labels (e.g. \'{"env":"prod"}\')'),
      },
      async (args) => {
        const body: Record<string, unknown> = { name: args.name };
        if (args.rules) body.rules = JSON.parse(args.rules as string);
        if (args.apply_to) body.apply_to = JSON.parse(args.apply_to as string);
        if (args.labels) body.labels = JSON.parse(args.labels as string);

        const result = await cloud.request('/firewalls', { method: 'POST', body });
        return cloud.formatOutput(result);
      },
    );

    register(
      'update_firewall',
      'Update a firewall (name and/or labels)',
      {
        id: z.number().describe('Firewall ID'),
        name: z.string().optional().describe('New firewall name'),
        labels: z.string().optional().describe('JSON object of labels (e.g. \'{"env":"prod"}\')'),
      },
      async (args) => {
        const body: Record<string, unknown> = {};
        if (args.name) body.name = args.name;
        if (args.labels) body.labels = JSON.parse(args.labels as string);

        const result = await cloud.request(`/firewalls/${args.id}`, {
          method: 'PUT',
          body,
        });
        return cloud.formatOutput(result);
      },
    );

    register(
      'delete_firewall',
      'Delete a firewall permanently',
      {
        id: z.number().describe('Firewall ID'),
        confirm: z.boolean().default(false).describe('Must be true to confirm deletion'),
      },
      async (args) => {
        if (!args.confirm) {
          return '⚠️ Please set confirm to true to delete this firewall. This action is irreversible.';
        }
        await cloud.request(`/firewalls/${args.id}`, { method: 'DELETE' });
        return cloud.appendWarning(`Firewall ${args.id} deleted successfully.`);
      },
    );

    register(
      'set_firewall_rules',
      'Set all rules for a firewall (replaces existing rules)',
      {
        id: z.number().describe('Firewall ID'),
        rules: z.string().describe('JSON array of firewall rules. Each rule: {direction: "in"|"out", protocol: "tcp"|"udp"|"icmp"|"esp"|"gre", port?: "80" or "1024-5000" (required for tcp/udp), source_ips?: ["0.0.0.0/0","::/0"], destination_ips?: ["0.0.0.0/0","::/0"], description?: "string"}'),
      },
      async (args) => {
        const rules = JSON.parse(args.rules as string);
        const result = await cloud.request<ActionsResponse>(
          `/firewalls/${args.id}/actions/set_rules`,
          { method: 'POST', body: { rules } },
        );
        // set_rules returns multiple actions
        const polled = [];
        for (const a of result.actions) {
          polled.push(await cloud.pollAction(a.id));
        }
        return cloud.formatOutput({ actions: polled });
      },
    );

    register(
      'apply_firewall_to_resources',
      'Apply a firewall to resources (servers or label selectors)',
      {
        id: z.number().describe('Firewall ID'),
        apply_to: z.string().describe('JSON array of resources to apply to (e.g. \'[{"type":"server","server":{"id":123}}]\' or \'[{"type":"label_selector","label_selector":{"selector":"env=prod"}}]\')'),
      },
      async (args) => {
        const apply_to = JSON.parse(args.apply_to as string);
        const result = await cloud.request<ActionsResponse>(
          `/firewalls/${args.id}/actions/apply_to_resources`,
          { method: 'POST', body: { apply_to } },
        );
        const polled = [];
        for (const a of result.actions) {
          polled.push(await cloud.pollAction(a.id));
        }
        return cloud.formatOutput({ actions: polled });
      },
    );

    register(
      'remove_firewall_from_resources',
      'Remove a firewall from resources',
      {
        id: z.number().describe('Firewall ID'),
        remove_from: z.string().describe('JSON array of resources to remove from (e.g. \'[{"type":"server","server":{"id":123}}]\')'),
      },
      async (args) => {
        const remove_from = JSON.parse(args.remove_from as string);
        const result = await cloud.request<ActionsResponse>(
          `/firewalls/${args.id}/actions/remove_from_resources`,
          { method: 'POST', body: { remove_from } },
        );
        const polled = [];
        for (const a of result.actions) {
          polled.push(await cloud.pollAction(a.id));
        }
        return cloud.formatOutput({ actions: polled });
      },
    );
  }
}
