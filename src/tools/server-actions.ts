/**
 * Hetzner Cloud Server Action tools — power, rescue, rebuild, networking, etc.
 */

import { z } from 'zod';
import type { ToolRegistrar } from '../server.js';
import type { CloudClient } from '../clients/cloud.js';
import type { HetznerAction } from '../clients/common.js';
import type { ActionResponse } from '../types/cloud.js';

export function registerServerActionTools(register: ToolRegistrar, cloud: CloudClient, readOnly: boolean): void {
  // ── Read-only action tools ──────────────────────────────────────────────

  register(
    'list_server_actions',
    'List all actions for a specific server.',
    {
      id: z.number().describe('Server ID'),
    },
    async (args) => {
      const actions = await cloud.requestAll<HetznerAction>(`/servers/${args.id}/actions`, 'actions');
      return cloud.formatOutput(actions);
    },
  );

  register(
    'get_server_action',
    'Get details of a specific action for a server.',
    {
      id: z.number().describe('Server ID'),
      action_id: z.number().describe('Action ID'),
    },
    async (args) => {
      const result = await cloud.request<ActionResponse>(`/servers/${args.id}/actions/${args.action_id}`);
      return cloud.formatOutput(result.action);
    },
  );

  // ── Mutating action tools ─────────────────────────────────────────────

  if (!readOnly) {
    register(
      'power_on_server',
      'Power on a server.',
      {
        id: z.number().describe('Server ID'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(`/servers/${args.id}/actions/poweron`, { method: 'POST' });
        await cloud.pollAction(result.action.id);
        return cloud.formatOutput(result.action);
      },
    );

    register(
      'power_off_server',
      'Power off a server immediately (hard power off). Use shutdown_server for graceful shutdown.',
      {
        id: z.number().describe('Server ID'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(`/servers/${args.id}/actions/poweroff`, { method: 'POST' });
        await cloud.pollAction(result.action.id);
        return cloud.formatOutput(result.action);
      },
    );

    register(
      'reboot_server',
      'Soft reboot a server (sends ACPI signal).',
      {
        id: z.number().describe('Server ID'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(`/servers/${args.id}/actions/reboot`, { method: 'POST' });
        await cloud.pollAction(result.action.id);
        return cloud.formatOutput(result.action);
      },
    );

    register(
      'reset_server',
      'Hard reset a server (like pressing the reset button).',
      {
        id: z.number().describe('Server ID'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(`/servers/${args.id}/actions/reset`, { method: 'POST' });
        await cloud.pollAction(result.action.id);
        return cloud.formatOutput(result.action);
      },
    );

    register(
      'shutdown_server',
      'Gracefully shut down a server (sends ACPI shutdown signal to OS).',
      {
        id: z.number().describe('Server ID'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(`/servers/${args.id}/actions/shutdown`, { method: 'POST' });
        await cloud.pollAction(result.action.id);
        return cloud.formatOutput(result.action);
      },
    );

    register(
      'rebuild_server',
      'Rebuild a server from an image. DESTRUCTIVE — all data on the server will be lost. Requires confirm=true.',
      {
        id: z.number().describe('Server ID'),
        image: z.string().describe('Image name or ID to rebuild from'),
        confirm: z.boolean().default(false).describe('Must be true to confirm rebuild'),
      },
      async (args) => {
        if (!args.confirm) {
          return 'Rebuild not confirmed. Set confirm=true to proceed. WARNING: All data on the server will be lost.';
        }
        const result = await cloud.request<{ action: HetznerAction; root_password: string | null }>(
          `/servers/${args.id}/actions/rebuild`,
          { method: 'POST', body: { image: args.image } },
        );
        if (result.action) {
          await cloud.pollAction(result.action.id);
        }
        return cloud.formatOutput(result);
      },
    );

    register(
      'change_server_type',
      'Change the server type (resize). Server must be stopped first.',
      {
        id: z.number().describe('Server ID'),
        server_type: z.string().describe('Target server type name (e.g. cx22, cpx31)'),
        upgrade_disk: z.boolean().default(false).describe('Whether to upgrade the disk size (irreversible if true)'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(`/servers/${args.id}/actions/change_type`, {
          method: 'POST',
          body: { server_type: args.server_type, upgrade_disk: args.upgrade_disk },
        });
        await cloud.pollAction(result.action.id);
        return cloud.formatOutput(result.action);
      },
    );

    register(
      'enable_server_rescue',
      'Enable rescue mode for a server. Returns a root password for the rescue system.',
      {
        id: z.number().describe('Server ID'),
        type: z.string().optional().describe('Rescue system type (linux64 or linux32). Default: linux64'),
        ssh_keys: z.string().optional().describe('Comma-separated SSH key IDs to inject into rescue system'),
      },
      async (args) => {
        const body: Record<string, unknown> = {};
        if (args.type) body.type = args.type;
        if (args.ssh_keys) {
          body.ssh_keys = (args.ssh_keys as string).split(',').map((s) => Number(s.trim()));
        }
        const result = await cloud.request<{ action: HetznerAction; root_password: string }>(
          `/servers/${args.id}/actions/enable_rescue`,
          { method: 'POST', body },
        );
        await cloud.pollAction(result.action.id);
        return cloud.formatOutput({ root_password: result.root_password, action: result.action });
      },
    );

    register(
      'disable_server_rescue',
      'Disable rescue mode for a server.',
      {
        id: z.number().describe('Server ID'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(`/servers/${args.id}/actions/disable_rescue`, { method: 'POST' });
        await cloud.pollAction(result.action.id);
        return cloud.formatOutput(result.action);
      },
    );

    register(
      'create_server_image',
      'Create an image (snapshot) from a server.',
      {
        id: z.number().describe('Server ID'),
        type: z.string().optional().describe('Image type: snapshot or backup. Default: snapshot'),
        description: z.string().optional().describe('Description for the image'),
        labels: z.string().optional().describe('Labels as JSON object'),
      },
      async (args) => {
        const body: Record<string, unknown> = {};
        if (args.type) body.type = args.type;
        if (args.description) body.description = args.description;
        if (args.labels) body.labels = JSON.parse(args.labels as string) as Record<string, string>;
        const result = await cloud.request<{ action: HetznerAction; image: unknown }>(
          `/servers/${args.id}/actions/create_image`,
          { method: 'POST', body },
        );
        if (result.action) {
          await cloud.pollAction(result.action.id);
        }
        return cloud.formatOutput(result);
      },
    );

    register(
      'enable_server_backup',
      'Enable automatic backups for a server.',
      {
        id: z.number().describe('Server ID'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(`/servers/${args.id}/actions/enable_backup`, { method: 'POST' });
        await cloud.pollAction(result.action.id);
        return cloud.formatOutput(result.action);
      },
    );

    register(
      'disable_server_backup',
      'Disable automatic backups for a server. Existing backups will be kept.',
      {
        id: z.number().describe('Server ID'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(`/servers/${args.id}/actions/disable_backup`, { method: 'POST' });
        await cloud.pollAction(result.action.id);
        return cloud.formatOutput(result.action);
      },
    );

    register(
      'attach_iso_to_server',
      'Attach an ISO image to a server.',
      {
        id: z.number().describe('Server ID'),
        iso: z.string().describe('ISO name or ID to attach'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(`/servers/${args.id}/actions/attach_iso`, {
          method: 'POST',
          body: { iso: args.iso },
        });
        await cloud.pollAction(result.action.id);
        return cloud.formatOutput(result.action);
      },
    );

    register(
      'detach_iso_from_server',
      'Detach the currently attached ISO from a server.',
      {
        id: z.number().describe('Server ID'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(`/servers/${args.id}/actions/detach_iso`, { method: 'POST' });
        await cloud.pollAction(result.action.id);
        return cloud.formatOutput(result.action);
      },
    );

    register(
      'change_server_dns_ptr',
      'Change the reverse DNS pointer for a server IP address.',
      {
        id: z.number().describe('Server ID'),
        ip: z.string().describe('IP address to set the reverse DNS pointer for'),
        dns_ptr: z.string().describe('Hostname to set as reverse DNS PTR record (or empty string to reset)'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(`/servers/${args.id}/actions/change_dns_ptr`, {
          method: 'POST',
          body: { ip: args.ip, dns_ptr: args.dns_ptr || null },
        });
        await cloud.pollAction(result.action.id);
        return cloud.formatOutput(result.action);
      },
    );

    register(
      'change_server_protection',
      'Change delete and rebuild protection for a server.',
      {
        id: z.number().describe('Server ID'),
        delete_protection: z.boolean().optional().describe('Enable or disable delete protection'),
        rebuild_protection: z.boolean().optional().describe('Enable or disable rebuild protection'),
      },
      async (args) => {
        const body: Record<string, unknown> = {};
        if (args.delete_protection !== undefined) body.delete = args.delete_protection;
        if (args.rebuild_protection !== undefined) body.rebuild = args.rebuild_protection;
        const result = await cloud.request<ActionResponse>(`/servers/${args.id}/actions/change_protection`, {
          method: 'POST',
          body,
        });
        await cloud.pollAction(result.action.id);
        return cloud.formatOutput(result.action);
      },
    );

    register(
      'request_server_console',
      'Request a WebSocket console URL for a server. Returns wss_url and password.',
      {
        id: z.number().describe('Server ID'),
      },
      async (args) => {
        const result = await cloud.request<{ action: HetznerAction; wss_url: string; password: string }>(
          `/servers/${args.id}/actions/request_console`,
          { method: 'POST' },
        );
        await cloud.pollAction(result.action.id);
        return cloud.formatOutput({ wss_url: result.wss_url, password: result.password });
      },
    );

    register(
      'attach_server_to_network',
      'Attach a server to a network.',
      {
        id: z.number().describe('Server ID'),
        network: z.number().describe('Network ID to attach to'),
        ip: z.string().optional().describe('IP address to assign in the network'),
        alias_ips: z.string().optional().describe('Comma-separated alias IPs to assign'),
      },
      async (args) => {
        const body: Record<string, unknown> = { network: args.network };
        if (args.ip) body.ip = args.ip;
        if (args.alias_ips) body.alias_ips = (args.alias_ips as string).split(',').map((s) => s.trim());
        const result = await cloud.request<ActionResponse>(`/servers/${args.id}/actions/attach_to_network`, {
          method: 'POST',
          body,
        });
        await cloud.pollAction(result.action.id);
        return cloud.formatOutput(result.action);
      },
    );

    register(
      'detach_server_from_network',
      'Detach a server from a network.',
      {
        id: z.number().describe('Server ID'),
        network: z.number().describe('Network ID to detach from'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(`/servers/${args.id}/actions/detach_from_network`, {
          method: 'POST',
          body: { network: args.network },
        });
        await cloud.pollAction(result.action.id);
        return cloud.formatOutput(result.action);
      },
    );

    register(
      'change_server_alias_ips',
      'Change the alias IPs of a server on a network.',
      {
        id: z.number().describe('Server ID'),
        network: z.number().describe('Network ID'),
        alias_ips: z.string().describe('Comma-separated list of alias IPs to set'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(`/servers/${args.id}/actions/change_alias_ips`, {
          method: 'POST',
          body: {
            network: args.network,
            alias_ips: (args.alias_ips as string).split(',').map((s) => s.trim()),
          },
        });
        await cloud.pollAction(result.action.id);
        return cloud.formatOutput(result.action);
      },
    );

    register(
      'add_server_to_placement_group',
      'Add a server to a placement group. Server must be stopped.',
      {
        id: z.number().describe('Server ID'),
        placement_group: z.number().describe('Placement group ID'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(`/servers/${args.id}/actions/add_to_placement_group`, {
          method: 'POST',
          body: { placement_group: args.placement_group },
        });
        await cloud.pollAction(result.action.id);
        return cloud.formatOutput(result.action);
      },
    );

    register(
      'remove_server_from_placement_group',
      'Remove a server from its placement group.',
      {
        id: z.number().describe('Server ID'),
      },
      async (args) => {
        const result = await cloud.request<ActionResponse>(
          `/servers/${args.id}/actions/remove_from_placement_group`,
          { method: 'POST' },
        );
        await cloud.pollAction(result.action.id);
        return cloud.formatOutput(result.action);
      },
    );
  }
}
