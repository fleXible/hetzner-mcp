/**
 * Hetzner Cloud Certificate tools — CRUD + managed cert retry.
 */

import { z } from 'zod';
import type { ToolRegistrar } from '../server.js';
import type { CloudClient } from '../clients/cloud.js';
import type { CloudCertificate, ActionResponse, ActionsResponse } from '../types/cloud.js';
import type { HetznerAction } from '../clients/common.js';

export function registerCertificateTools(register: ToolRegistrar, cloud: CloudClient, readOnly: boolean): void {
  // ── Read-only tools ─────────────────────────────────────────────────────

  register(
    'list_certificates',
    'List all TLS certificates in the Hetzner Cloud project. Supports filtering by name, label selector, type, and sorting.',
    {
      name: z.string().optional().describe('Filter by certificate name'),
      label_selector: z.string().optional().describe('Label selector to filter (e.g. "env=prod")'),
      type: z.string().optional().describe('Filter by type: uploaded or managed'),
      sort: z.string().optional().describe('Sort by field (id, name, created — add :asc or :desc)'),
    },
    async (args) => {
      const params: Record<string, string | undefined> = {
        name: args.name as string | undefined,
        label_selector: args.label_selector as string | undefined,
        type: args.type as string | undefined,
        sort: args.sort as string | undefined,
      };
      const certs = await cloud.requestAll<CloudCertificate>('/certificates', 'certificates', params);
      return cloud.formatOutput(certs);
    },
  );

  register(
    'get_certificate',
    'Get detailed information about a specific certificate by ID.',
    {
      id: z.number().describe('Certificate ID'),
    },
    async (args) => {
      const result = await cloud.request<{ certificate: CloudCertificate }>(`/certificates/${args.id}`);
      return cloud.formatOutput(result.certificate);
    },
  );

  register(
    'list_certificate_actions',
    'List all actions for a specific certificate.',
    {
      id: z.number().describe('Certificate ID'),
    },
    async (args) => {
      const result = await cloud.request<ActionsResponse>(`/certificates/${args.id}/actions`);
      return cloud.formatOutput(result.actions);
    },
  );

  // ── Mutating tools ────────────────────────────────────────────────────

  if (!readOnly) {
    register(
      'create_certificate',
      'Create a new TLS certificate. For uploaded certs, provide certificate + private_key. For managed certs, provide domain_names.',
      {
        name: z.string().describe('Name of the certificate'),
        type: z.string().describe('Certificate type: uploaded or managed'),
        certificate: z.string().optional().describe('PEM-encoded certificate (required for uploaded type)'),
        private_key: z.string().optional().describe('PEM-encoded private key (required for uploaded type)'),
        domain_names: z.string().optional().describe('Comma-separated domain names (required for managed type)'),
        labels: z.string().optional().describe('Labels as JSON object (e.g. {"env":"prod"})'),
      },
      async (args) => {
        const body: Record<string, unknown> = {
          name: args.name,
          type: args.type,
        };
        if (args.certificate) body.certificate = args.certificate;
        if (args.private_key) body.private_key = args.private_key;
        if (args.domain_names) {
          body.domain_names = (args.domain_names as string).split(',').map((s) => s.trim());
        }
        if (args.labels) {
          body.labels = JSON.parse(args.labels as string) as Record<string, string>;
        }

        const result = await cloud.request<{
          certificate: CloudCertificate;
          action?: HetznerAction;
        }>('/certificates', { method: 'POST', body });

        if (result.action) {
          await cloud.pollAction(result.action.id);
        }

        return cloud.formatOutput(result.certificate);
      },
    );

    register(
      'update_certificate',
      'Update a certificate\'s name or labels.',
      {
        id: z.number().describe('Certificate ID'),
        name: z.string().optional().describe('New certificate name'),
        labels: z.string().optional().describe('New labels as JSON object (e.g. {"env":"staging"})'),
      },
      async (args) => {
        const body: Record<string, unknown> = {};
        if (args.name !== undefined) body.name = args.name;
        if (args.labels !== undefined) {
          body.labels = JSON.parse(args.labels as string) as Record<string, string>;
        }

        const result = await cloud.request<{ certificate: CloudCertificate }>(`/certificates/${args.id}`, {
          method: 'PUT',
          body,
        });
        return cloud.formatOutput(result.certificate);
      },
    );

    register(
      'delete_certificate',
      'Delete a certificate permanently. Requires confirm=true.',
      {
        id: z.number().describe('Certificate ID'),
        confirm: z.boolean().default(false).describe('Must be true to confirm deletion'),
      },
      async (args) => {
        if (!args.confirm) {
          return 'Deletion not confirmed. Set confirm=true to proceed with deleting this certificate.';
        }
        const result = await cloud.request<Record<string, unknown>>(`/certificates/${args.id}`, {
          method: 'DELETE',
        });
        return cloud.formatOutput(result);
      },
    );

    register(
      'retry_certificate_issuance',
      'Retry issuance of a managed certificate that failed. Only applicable to managed certificates.',
      {
        id: z.number().describe('Certificate ID (must be a managed certificate)'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(`/certificates/${args.id}/actions/retry`, {
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
