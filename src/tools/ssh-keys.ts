/**
 * Hetzner Cloud SSH Key tools — CRUD.
 */

import { z } from 'zod';
import type { ToolRegistrar } from '../server.js';
import type { CloudClient } from '../clients/cloud.js';
import type { CloudSSHKey } from '../types/cloud.js';

export function registerSshKeyTools(register: ToolRegistrar, cloud: CloudClient, readOnly: boolean): void {
  // ── Read-only tools ─────────────────────────────────────────────────────

  register(
    'list_ssh_keys',
    'List all SSH keys in the Hetzner Cloud project. Supports filtering by name, label selector, fingerprint, and sorting.',
    {
      name: z.string().optional().describe('Filter by SSH key name'),
      label_selector: z.string().optional().describe('Label selector to filter (e.g. "env=prod")'),
      fingerprint: z.string().optional().describe('Filter by SSH key fingerprint'),
      sort: z.string().optional().describe('Sort by field (id, name — add :asc or :desc)'),
    },
    async (args) => {
      const params: Record<string, string | undefined> = {
        name: args.name as string | undefined,
        label_selector: args.label_selector as string | undefined,
        fingerprint: args.fingerprint as string | undefined,
        sort: args.sort as string | undefined,
      };
      const keys = await cloud.requestAll<CloudSSHKey>('/ssh_keys', 'ssh_keys', params);
      return cloud.formatOutput(keys);
    },
  );

  register(
    'get_ssh_key',
    'Get detailed information about a specific SSH key by ID.',
    {
      id: z.number().describe('SSH key ID'),
    },
    async (args) => {
      const result = await cloud.request<{ ssh_key: CloudSSHKey }>(`/ssh_keys/${args.id}`);
      return cloud.formatOutput(result.ssh_key);
    },
  );

  // ── Mutating tools ────────────────────────────────────────────────────

  if (!readOnly) {
    register(
      'create_ssh_key',
      'Create a new SSH key. Provide the public key content (e.g. "ssh-ed25519 AAAA...").',
      {
        name: z.string().describe('Name of the SSH key'),
        public_key: z.string().describe('Public key content (e.g. "ssh-ed25519 AAAA..." or "ssh-rsa AAAA...")'),
        labels: z.string().optional().describe('Labels as JSON object (e.g. {"env":"prod"})'),
      },
      async (args) => {
        const body: Record<string, unknown> = {
          name: args.name,
          public_key: args.public_key,
        };
        if (args.labels) {
          body.labels = JSON.parse(args.labels as string) as Record<string, string>;
        }

        const result = await cloud.request<{ ssh_key: CloudSSHKey }>('/ssh_keys', {
          method: 'POST',
          body,
        });
        return cloud.formatOutput(result.ssh_key);
      },
    );

    register(
      'update_ssh_key',
      'Update an SSH key\'s name or labels.',
      {
        id: z.number().describe('SSH key ID'),
        name: z.string().optional().describe('New SSH key name'),
        labels: z.string().optional().describe('New labels as JSON object (e.g. {"env":"staging"})'),
      },
      async (args) => {
        const body: Record<string, unknown> = {};
        if (args.name !== undefined) body.name = args.name;
        if (args.labels !== undefined) {
          body.labels = JSON.parse(args.labels as string) as Record<string, string>;
        }

        const result = await cloud.request<{ ssh_key: CloudSSHKey }>(`/ssh_keys/${args.id}`, {
          method: 'PUT',
          body,
        });
        return cloud.formatOutput(result.ssh_key);
      },
    );

    register(
      'delete_ssh_key',
      'Delete an SSH key permanently. Requires confirm=true.',
      {
        id: z.number().describe('SSH key ID'),
        confirm: z.boolean().default(false).describe('Must be true to confirm deletion'),
      },
      async (args) => {
        if (!args.confirm) {
          return 'Deletion not confirmed. Set confirm=true to proceed with deleting this SSH key.';
        }
        const result = await cloud.request<Record<string, unknown>>(`/ssh_keys/${args.id}`, {
          method: 'DELETE',
        });
        return cloud.formatOutput(result);
      },
    );
  }
}
