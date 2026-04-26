/**
 * Hetzner Cloud Load Balancer Type tools — read-only type catalog.
 */

import { z } from 'zod';
import type { ToolRegistrar } from '../server.js';
import type { CloudClient } from '../clients/cloud.js';

interface CloudLoadBalancerType {
  id: number;
  name: string;
  description: string;
  max_connections: number;
  max_services: number;
  max_targets: number;
  max_assigned_certificates: number;
  prices: Array<{
    location: string;
    price_hourly: { net: string; gross: string };
    price_monthly: { net: string; gross: string };
  }>;
}

export function registerLoadBalancerTypeTools(register: ToolRegistrar, cloud: CloudClient): void {
  register(
    'list_load_balancer_types',
    'List all available load balancer types with specs and pricing.',
    {},
    async () => {
      const types = await cloud.requestAll<CloudLoadBalancerType>('/load_balancer_types', 'load_balancer_types');
      return cloud.formatOutput(types);
    },
  );

  register(
    'get_load_balancer_type',
    'Get detailed information about a specific load balancer type by ID.',
    {
      id: z.number().describe('Load balancer type ID'),
    },
    async (args) => {
      const result = await cloud.request<{ load_balancer_type: CloudLoadBalancerType }>(`/load_balancer_types/${args.id}`);
      return cloud.formatOutput(result.load_balancer_type);
    },
  );
}
