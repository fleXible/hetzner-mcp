/**
 * Hetzner Cloud Network tools — list, get, create, update, delete, subnets, routes, protection.
 */

import { z } from 'zod';
import type { ToolRegistrar } from '../server.js';
import type { CloudClient } from '../clients/cloud.js';
import type { ActionResponse } from '../types/cloud.js';

export function registerNetworkTools(register: ToolRegistrar, cloud: CloudClient, readOnly: boolean): void {
  // ── Read-only tools ─────────────────────────────────────────────────────

  register(
    'list_networks',
    'List all networks in the project, with optional filters',
    {
      name: z.string().optional().describe('Filter by network name'),
      label_selector: z.string().optional().describe('Filter by label selector (e.g. "env=prod")'),
    },
    async (args) => {
      const networks = await cloud.requestAll('/networks', 'networks', {
        name: args.name as string | undefined,
        label_selector: args.label_selector as string | undefined,
      });
      return cloud.formatOutput(networks);
    },
  );

  register(
    'get_network',
    'Get details of a specific network by ID',
    {
      id: z.number().describe('Network ID'),
    },
    async (args) => {
      const result = await cloud.request(`/networks/${args.id}`);
      return cloud.formatOutput(result);
    },
  );

  register(
    'list_network_actions',
    'List all actions for a specific network',
    {
      id: z.number().describe('Network ID'),
    },
    async (args) => {
      const actions = await cloud.requestAll(`/networks/${args.id}/actions`, 'actions');
      return cloud.formatOutput(actions);
    },
  );

  // ── Mutating tools ──────────────────────────────────────────────────────

  if (!readOnly) {
    register(
      'create_network',
      'Create a new network',
      {
        name: z.string().describe('Name of the network'),
        ip_range: z.string().describe('IP range of the network (e.g. "10.0.0.0/8")'),
        subnets: z.string().optional().describe('JSON array of subnets (e.g. \'[{"type":"cloud","ip_range":"10.0.1.0/24","network_zone":"eu-central"}]\')'),
        routes: z.string().optional().describe('JSON array of routes (e.g. \'[{"destination":"10.100.1.0/24","gateway":"10.0.1.1"}]\')'),
        labels: z.string().optional().describe('JSON object of labels (e.g. \'{"env":"prod"}\')'),
      },
      async (args) => {
        const body: Record<string, unknown> = {
          name: args.name,
          ip_range: args.ip_range,
        };
        if (args.subnets) body.subnets = JSON.parse(args.subnets as string);
        if (args.routes) body.routes = JSON.parse(args.routes as string);
        if (args.labels) body.labels = JSON.parse(args.labels as string);

        const result = await cloud.request('/networks', { method: 'POST', body });
        return cloud.formatOutput(result);
      },
    );

    register(
      'update_network',
      'Update a network (name and/or labels)',
      {
        id: z.number().describe('Network ID'),
        name: z.string().optional().describe('New network name'),
        labels: z.string().optional().describe('JSON object of labels (e.g. \'{"env":"prod"}\')'),
      },
      async (args) => {
        const body: Record<string, unknown> = {};
        if (args.name) body.name = args.name;
        if (args.labels) body.labels = JSON.parse(args.labels as string);

        const result = await cloud.request(`/networks/${args.id}`, {
          method: 'PUT',
          body,
        });
        return cloud.formatOutput(result);
      },
    );

    register(
      'delete_network',
      'Delete a network permanently',
      {
        id: z.number().describe('Network ID'),
        confirm: z.boolean().default(false).describe('Must be true to confirm deletion'),
      },
      async (args) => {
        if (!args.confirm) {
          return '⚠️ Please set confirm to true to delete this network. This action is irreversible.';
        }
        await cloud.request(`/networks/${args.id}`, { method: 'DELETE' });
        return cloud.appendWarning(`Network ${args.id} deleted successfully.`);
      },
    );

    register(
      'add_subnet_to_network',
      'Add a subnet to a network',
      {
        id: z.number().describe('Network ID'),
        type: z.string().describe('Subnet type (cloud, server, vswitch)'),
        ip_range: z.string().describe('IP range of the subnet (e.g. "10.0.1.0/24")'),
        network_zone: z.string().describe('Network zone (e.g. "eu-central")'),
        vswitch_id: z.number().optional().describe('vSwitch ID (required for type=vswitch)'),
        gateway: z.string().optional().describe('Gateway IP of the subnet'),
      },
      async (args) => {
        const body: Record<string, unknown> = {
          type: args.type,
          ip_range: args.ip_range,
          network_zone: args.network_zone,
        };
        if (args.vswitch_id) body.vswitch_id = args.vswitch_id;
        if (args.gateway) body.gateway = args.gateway;

        const result = await cloud.request<ActionResponse>(
          `/networks/${args.id}/actions/add_subnet`,
          { method: 'POST', body },
        );
        const action = await cloud.pollAction(result.action.id);
        return cloud.formatOutput({ action });
      },
    );

    register(
      'delete_subnet_from_network',
      'Delete a subnet from a network',
      {
        id: z.number().describe('Network ID'),
        ip_range: z.string().describe('IP range of the subnet to delete (e.g. "10.0.1.0/24")'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(
          `/networks/${args.id}/actions/delete_subnet`,
          { method: 'POST', body: { ip_range: args.ip_range } },
        );
        const action = await cloud.pollAction(result.action.id);
        return cloud.formatOutput({ action });
      },
    );

    register(
      'add_route_to_network',
      'Add a route to a network',
      {
        id: z.number().describe('Network ID'),
        destination: z.string().describe('Destination network of the route (e.g. "10.100.1.0/24")'),
        gateway: z.string().describe('Gateway of the route (e.g. "10.0.1.1")'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(
          `/networks/${args.id}/actions/add_route`,
          { method: 'POST', body: { destination: args.destination, gateway: args.gateway } },
        );
        const action = await cloud.pollAction(result.action.id);
        return cloud.formatOutput({ action });
      },
    );

    register(
      'delete_route_from_network',
      'Delete a route from a network',
      {
        id: z.number().describe('Network ID'),
        destination: z.string().describe('Destination network of the route to delete'),
        gateway: z.string().describe('Gateway of the route to delete'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(
          `/networks/${args.id}/actions/delete_route`,
          { method: 'POST', body: { destination: args.destination, gateway: args.gateway } },
        );
        const action = await cloud.pollAction(result.action.id);
        return cloud.formatOutput({ action });
      },
    );

    register(
      'change_network_ip_range',
      'Change the IP range of a network',
      {
        id: z.number().describe('Network ID'),
        ip_range: z.string().describe('New IP range of the network (e.g. "10.0.0.0/8")'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(
          `/networks/${args.id}/actions/change_ip_range`,
          { method: 'POST', body: { ip_range: args.ip_range } },
        );
        const action = await cloud.pollAction(result.action.id);
        return cloud.formatOutput({ action });
      },
    );

    register(
      'change_network_protection',
      'Change delete protection for a network',
      {
        id: z.number().describe('Network ID'),
        delete: z.boolean().describe('Enable or disable delete protection'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(
          `/networks/${args.id}/actions/change_protection`,
          { method: 'POST', body: { delete: args.delete } },
        );
        const action = await cloud.pollAction(result.action.id);
        return cloud.formatOutput({ action });
      },
    );
  }
}
