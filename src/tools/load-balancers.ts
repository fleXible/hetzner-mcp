/**
 * Hetzner Cloud Load Balancer tools — CRUD, targets, services, actions.
 */

import { z } from 'zod';
import type { ToolRegistrar } from '../server.js';
import type { CloudClient } from '../clients/cloud.js';
import type { CloudLoadBalancer, ActionResponse, ActionsResponse } from '../types/cloud.js';
import type { HetznerAction } from '../clients/common.js';

export function registerLoadBalancerTools(register: ToolRegistrar, cloud: CloudClient, readOnly: boolean): void {
  // ── Read-only tools ─────────────────────────────────────────────────────

  register(
    'list_load_balancers',
    'List all load balancers in the Hetzner Cloud project. Supports filtering by name, label selector, and sorting.',
    {
      name: z.string().optional().describe('Filter by load balancer name'),
      label_selector: z.string().optional().describe('Label selector to filter (e.g. "env=prod")'),
      sort: z.string().optional().describe('Sort by field (id, name, created — add :asc or :desc)'),
    },
    async (args) => {
      const params: Record<string, string | undefined> = {
        name: args.name as string | undefined,
        label_selector: args.label_selector as string | undefined,
        sort: args.sort as string | undefined,
      };
      const lbs = await cloud.requestAll<CloudLoadBalancer>('/load_balancers', 'load_balancers', params);
      return cloud.formatOutput(lbs);
    },
  );

  register(
    'get_load_balancer',
    'Get detailed information about a specific load balancer by ID.',
    {
      id: z.number().describe('Load balancer ID'),
    },
    async (args) => {
      const result = await cloud.request<{ load_balancer: CloudLoadBalancer }>(`/load_balancers/${args.id}`);
      return cloud.formatOutput(result.load_balancer);
    },
  );

  register(
    'get_load_balancer_metrics',
    'Get metrics for a load balancer over a time range (open_connections, connections_per_second, requests_per_second, bandwidth).',
    {
      id: z.number().describe('Load balancer ID'),
      type: z.string().describe('Metric type: open_connections, connections_per_second, requests_per_second, bandwidth'),
      start: z.string().describe('Start of period in ISO 8601 format (e.g. 2024-01-01T00:00:00Z)'),
      end: z.string().describe('End of period in ISO 8601 format (e.g. 2024-01-02T00:00:00Z)'),
    },
    async (args) => {
      const result = await cloud.request<{ metrics: unknown }>(`/load_balancers/${args.id}/metrics`, {
        params: {
          type: args.type as string,
          start: args.start as string,
          end: args.end as string,
        },
      });
      return cloud.formatOutput(result.metrics);
    },
  );

  register(
    'list_load_balancer_actions',
    'List all actions for a specific load balancer.',
    {
      id: z.number().describe('Load balancer ID'),
    },
    async (args) => {
      const result = await cloud.request<ActionsResponse>(`/load_balancers/${args.id}/actions`);
      return cloud.formatOutput(result.actions);
    },
  );

  // ── Mutating tools ────────────────────────────────────────────────────

  if (!readOnly) {
    register(
      'create_load_balancer',
      'Create a new load balancer. Requires name, type, and algorithm. Optionally configure network zone, targets, and services.',
      {
        name: z.string().describe('Name of the load balancer'),
        load_balancer_type: z.string().describe('Load balancer type name or ID (e.g. lb11)'),
        algorithm_type: z.string().describe('Algorithm type: round_robin or least_connections'),
        network_zone: z.string().optional().describe('Network zone (e.g. eu-central)'),
        public_interface: z.boolean().optional().describe('Enable public interface (default: true)'),
        labels: z.string().optional().describe('Labels as JSON object (e.g. {"env":"prod"})'),
        targets: z.string().optional().describe('JSON array of target objects (e.g. [{"type":"server","server":{"id":1}}])'),
        services: z.string().optional().describe('JSON array of service objects with protocol, listen_port, destination_port, etc.'),
      },
      async (args) => {
        const body: Record<string, unknown> = {
          name: args.name,
          load_balancer_type: args.load_balancer_type,
          algorithm: { type: args.algorithm_type },
        };
        if (args.network_zone) body.network_zone = args.network_zone;
        if (args.public_interface !== undefined) body.public_interface = args.public_interface;
        if (args.labels) {
          body.labels = JSON.parse(args.labels as string) as Record<string, string>;
        }
        if (args.targets) {
          body.targets = JSON.parse(args.targets as string) as unknown[];
        }
        if (args.services) {
          body.services = JSON.parse(args.services as string) as unknown[];
        }

        const result = await cloud.request<{
          load_balancer: CloudLoadBalancer;
          action: HetznerAction;
        }>('/load_balancers', { method: 'POST', body });

        if (result.action) {
          await cloud.pollAction(result.action.id);
        }

        return cloud.formatOutput(result.load_balancer);
      },
    );

    register(
      'update_load_balancer',
      'Update a load balancer\'s name or labels.',
      {
        id: z.number().describe('Load balancer ID'),
        name: z.string().optional().describe('New load balancer name'),
        labels: z.string().optional().describe('New labels as JSON object (e.g. {"env":"staging"})'),
      },
      async (args) => {
        const body: Record<string, unknown> = {};
        if (args.name !== undefined) body.name = args.name;
        if (args.labels !== undefined) {
          body.labels = JSON.parse(args.labels as string) as Record<string, string>;
        }

        const result = await cloud.request<{ load_balancer: CloudLoadBalancer }>(`/load_balancers/${args.id}`, {
          method: 'PUT',
          body,
        });
        return cloud.formatOutput(result.load_balancer);
      },
    );

    register(
      'delete_load_balancer',
      'Delete a load balancer permanently. Requires confirm=true.',
      {
        id: z.number().describe('Load balancer ID'),
        confirm: z.boolean().default(false).describe('Must be true to confirm deletion'),
      },
      async (args) => {
        if (!args.confirm) {
          return 'Deletion not confirmed. Set confirm=true to proceed with deleting this load balancer.';
        }
        const result = await cloud.request<Record<string, unknown>>(`/load_balancers/${args.id}`, {
          method: 'DELETE',
        });
        return cloud.formatOutput(result);
      },
    );

    register(
      'add_load_balancer_target',
      'Add a target (server, label_selector, or IP) to a load balancer.',
      {
        id: z.number().describe('Load balancer ID'),
        type: z.string().describe('Target type: server, label_selector, or ip'),
        server_id: z.number().optional().describe('Server ID (required if type=server)'),
        label_selector: z.string().optional().describe('Label selector string (required if type=label_selector)'),
        ip: z.string().optional().describe('IP address (required if type=ip)'),
        use_private_ip: z.boolean().optional().describe('Use private IP for the target'),
      },
      async (args) => {
        const body: Record<string, unknown> = { type: args.type };
        if (args.server_id !== undefined) body.server = { id: args.server_id };
        if (args.label_selector !== undefined) body.label_selector = { selector: args.label_selector };
        if (args.ip !== undefined) body.ip = { ip: args.ip };
        if (args.use_private_ip !== undefined) body.use_private_ip = args.use_private_ip;

        const result = await cloud.request<ActionResponse>(`/load_balancers/${args.id}/actions/add_target`, {
          method: 'POST',
          body,
        });
        if (result.action) {
          await cloud.pollAction(result.action.id);
        }
        return cloud.formatOutput(result.action);
      },
    );

    register(
      'remove_load_balancer_target',
      'Remove a target from a load balancer.',
      {
        id: z.number().describe('Load balancer ID'),
        type: z.string().describe('Target type: server, label_selector, or ip'),
        server_id: z.number().optional().describe('Server ID (required if type=server)'),
        label_selector: z.string().optional().describe('Label selector string (required if type=label_selector)'),
        ip: z.string().optional().describe('IP address (required if type=ip)'),
      },
      async (args) => {
        const body: Record<string, unknown> = { type: args.type };
        if (args.server_id !== undefined) body.server = { id: args.server_id };
        if (args.label_selector !== undefined) body.label_selector = { selector: args.label_selector };
        if (args.ip !== undefined) body.ip = { ip: args.ip };

        const result = await cloud.request<ActionResponse>(`/load_balancers/${args.id}/actions/remove_target`, {
          method: 'POST',
          body,
        });
        if (result.action) {
          await cloud.pollAction(result.action.id);
        }
        return cloud.formatOutput(result.action);
      },
    );

    register(
      'add_load_balancer_service',
      'Add a service to a load balancer. Accepts a JSON config string for the service.',
      {
        id: z.number().describe('Load balancer ID'),
        service: z.string().describe('JSON service config: { "protocol": "http"|"https"|"tcp", "listen_port": 80, "destination_port": 80, "health_check": {...}, "http": {...} }'),
      },
      async (args) => {
        const body = JSON.parse(args.service as string) as Record<string, unknown>;

        const result = await cloud.request<ActionResponse>(`/load_balancers/${args.id}/actions/add_service`, {
          method: 'POST',
          body,
        });
        if (result.action) {
          await cloud.pollAction(result.action.id);
        }
        return cloud.formatOutput(result.action);
      },
    );

    register(
      'update_load_balancer_service',
      'Update an existing service on a load balancer. Accepts a JSON config string.',
      {
        id: z.number().describe('Load balancer ID'),
        service: z.string().describe('JSON service config with listen_port to identify the service, plus fields to update'),
      },
      async (args) => {
        const body = JSON.parse(args.service as string) as Record<string, unknown>;

        const result = await cloud.request<ActionResponse>(`/load_balancers/${args.id}/actions/update_service`, {
          method: 'POST',
          body,
        });
        if (result.action) {
          await cloud.pollAction(result.action.id);
        }
        return cloud.formatOutput(result.action);
      },
    );

    register(
      'delete_load_balancer_service',
      'Delete a service from a load balancer by listen port.',
      {
        id: z.number().describe('Load balancer ID'),
        listen_port: z.number().describe('Listen port of the service to delete'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(`/load_balancers/${args.id}/actions/delete_service`, {
          method: 'POST',
          body: { listen_port: args.listen_port },
        });
        if (result.action) {
          await cloud.pollAction(result.action.id);
        }
        return cloud.formatOutput(result.action);
      },
    );

    register(
      'change_load_balancer_algorithm',
      'Change the algorithm of a load balancer.',
      {
        id: z.number().describe('Load balancer ID'),
        type: z.string().describe('Algorithm type: round_robin or least_connections'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(`/load_balancers/${args.id}/actions/change_algorithm`, {
          method: 'POST',
          body: { type: args.type },
        });
        if (result.action) {
          await cloud.pollAction(result.action.id);
        }
        return cloud.formatOutput(result.action);
      },
    );

    register(
      'change_load_balancer_type',
      'Change the type of a load balancer (e.g. upgrade from lb11 to lb21).',
      {
        id: z.number().describe('Load balancer ID'),
        load_balancer_type: z.string().describe('New load balancer type name or ID'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(`/load_balancers/${args.id}/actions/change_type`, {
          method: 'POST',
          body: { load_balancer_type: args.load_balancer_type },
        });
        if (result.action) {
          await cloud.pollAction(result.action.id);
        }
        return cloud.formatOutput(result.action);
      },
    );

    register(
      'change_load_balancer_protection',
      'Change the delete protection for a load balancer.',
      {
        id: z.number().describe('Load balancer ID'),
        delete_protection: z.boolean().describe('Enable or disable delete protection'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(`/load_balancers/${args.id}/actions/change_protection`, {
          method: 'POST',
          body: { delete: args.delete_protection },
        });
        if (result.action) {
          await cloud.pollAction(result.action.id);
        }
        return cloud.formatOutput(result.action);
      },
    );

    register(
      'change_load_balancer_dns_ptr',
      'Change the reverse DNS entry for a load balancer IP.',
      {
        id: z.number().describe('Load balancer ID'),
        ip: z.string().describe('IP address to set the reverse DNS for'),
        dns_ptr: z.string().describe('Hostname to set as reverse DNS PTR record (or empty string to reset)'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(`/load_balancers/${args.id}/actions/change_dns_ptr`, {
          method: 'POST',
          body: { ip: args.ip, dns_ptr: args.dns_ptr },
        });
        if (result.action) {
          await cloud.pollAction(result.action.id);
        }
        return cloud.formatOutput(result.action);
      },
    );

    register(
      'attach_load_balancer_to_network',
      'Attach a load balancer to a network.',
      {
        id: z.number().describe('Load balancer ID'),
        network: z.number().describe('Network ID to attach to'),
        ip: z.string().optional().describe('IP address in the network subnet (auto-assigned if omitted)'),
      },
      async (args) => {
        const body: Record<string, unknown> = { network: args.network };
        if (args.ip !== undefined) body.ip = args.ip;

        const result = await cloud.request<ActionResponse>(`/load_balancers/${args.id}/actions/attach_to_network`, {
          method: 'POST',
          body,
        });
        if (result.action) {
          await cloud.pollAction(result.action.id);
        }
        return cloud.formatOutput(result.action);
      },
    );

    register(
      'detach_load_balancer_from_network',
      'Detach a load balancer from a network.',
      {
        id: z.number().describe('Load balancer ID'),
        network: z.number().describe('Network ID to detach from'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(`/load_balancers/${args.id}/actions/detach_from_network`, {
          method: 'POST',
          body: { network: args.network },
        });
        if (result.action) {
          await cloud.pollAction(result.action.id);
        }
        return cloud.formatOutput(result.action);
      },
    );

    register(
      'enable_load_balancer_public_interface',
      'Enable the public interface of a load balancer.',
      {
        id: z.number().describe('Load balancer ID'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(`/load_balancers/${args.id}/actions/enable_public_interface`, {
          method: 'POST',
          body: {},
        });
        if (result.action) {
          await cloud.pollAction(result.action.id);
        }
        return cloud.formatOutput(result.action);
      },
    );

    register(
      'disable_load_balancer_public_interface',
      'Disable the public interface of a load balancer. The load balancer must be attached to a network first.',
      {
        id: z.number().describe('Load balancer ID'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(`/load_balancers/${args.id}/actions/disable_public_interface`, {
          method: 'POST',
          body: {},
        });
        if (result.action) {
          await cloud.pollAction(result.action.id);
        }
        return cloud.formatOutput(result.action);
      },
    );
  }
}
