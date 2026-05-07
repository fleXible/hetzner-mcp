/**
 * Hetzner Cloud Pricing tools — read-only.
 */

import type { ToolRegistrar } from '../server.js';
import type { CloudClient } from '../clients/cloud.js';

export function registerPricingTools(register: ToolRegistrar, cloud: CloudClient): void {
  register(
    'get_pricing',
    'Get pricing information for all Hetzner Cloud resources including servers, volumes, IPs, load balancers, and traffic.',
    {},
    async () => {
      const result = await cloud.request<{ pricing: unknown }>('/pricing');
      return cloud.formatOutput(result.pricing);
    },
  );
}
