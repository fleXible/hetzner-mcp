# hetzner-mcp

Production-grade MCP (Model Context Protocol) server for **all three Hetzner APIs**: Cloud, Robot (dedicated servers), and DNS.

## Features

- **~170 MCP tools** covering every meaningful Hetzner API operation
- **Hetzner Cloud API** — Servers, volumes, networks, firewalls, floating/primary IPs, load balancers, certificates, SSH keys, placement groups, images, ISOs, storage boxes, datacenters, locations, pricing, actions
- **Hetzner Robot API** — Dedicated servers, reset, Wake-on-LAN, boot configuration (rescue/linux/vnc), SSH keys, IPs, subnets, firewalls, vSwitch, RDNS, traffic, failover
- **Hetzner DNS API** — Zones, records, bulk operations, zone file import/export
- **Safety modes** — `read_only` (default) hides all mutating tools; `read_write` enables full access
- **Tool group filtering** — `HETZNER_TOOLS` selectively enables `cloud`, `dns`, and/or `robot` tool groups
- **Destructive operation guards** — Delete/rebuild tools require explicit `confirm: true`
- **Auto-pagination** — List endpoints return all results automatically
- **Rate limit awareness** — Warnings when approaching API limits
- **Action polling** — Mutations that return actions are polled to completion
- **Zero dependencies** beyond `@modelcontextprotocol/sdk` and `zod`

## Installation

```bash
npm install
npm run build
```

## Configuration

Set environment variables for the APIs you want to use:

```bash
# Cloud + DNS API (uses same token)
export HETZNER_CLOUD_TOKEN=your-cloud-api-token

# Robot API (dedicated servers)
export HETZNER_ROBOT_USER=your-robot-username
export HETZNER_ROBOT_PASSWORD=your-robot-password

# Safety mode (default: read_only)
export HETZNER_MODE=read_only   # or read_write

# Tool groups to enable (default: all configured)
export HETZNER_TOOLS=cloud,dns,robot
```

At least one API must be configured. Tools are only registered for configured APIs.

### Tool Group Filtering

Use `HETZNER_TOOLS` to selectively enable only specific tool groups. The value is a comma-separated list of: `cloud`, `dns`, `robot`.

- If **not set**, all groups with valid credentials are enabled automatically (`cloud` and `dns` when `HETZNER_CLOUD_TOKEN` is set, `robot` when Robot credentials are set).
- If **set**, only the listed groups are registered — even if credentials for other groups are available.

Examples:

```bash
# Only DNS and Robot tools (skip Cloud)
export HETZNER_TOOLS=dns,robot

# Only Cloud tools (skip DNS and Robot)
export HETZNER_TOOLS=cloud
```

Invalid group names cause the server to exit with an error.

## Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "hetzner": {
      "command": "node",
      "args": ["/path/to/hetzner-mcp/dist/index.js"],
      "env": {
        "HETZNER_CLOUD_TOKEN": "your-token-here",
        "HETZNER_MODE": "read_only"
      }
    }
  }
}
```

For Robot API access, add `HETZNER_ROBOT_USER` and `HETZNER_ROBOT_PASSWORD` to the `env` block.

## Safety Modes

### `read_only` (default)

Only read operations are available. No tools that create, update, or delete resources are registered. This is the safe default for exploration and monitoring.

### `read_write`

All tools are available including mutations. Destructive operations (`delete_*`, `rebuild_server`, `cancel_robot_server`) require an explicit `confirm: true` parameter. If `confirm` is not set, these tools return a warning message instead of executing.

## Tool Naming Convention

| API | Prefix | Example |
|-----|--------|---------|
| Cloud | (none) | `list_servers`, `create_volume` |
| DNS | `dns_` | `list_dns_zones`, `create_dns_record` |
| Robot | `robot_` | `list_robot_servers`, `reset_robot_server` |

## Cloud API Tools (~100 tools)

### Servers
`list_servers`, `get_server`, `create_server`, `update_server`, `delete_server`, `get_server_metrics`

### Server Actions
`power_on_server`, `power_off_server`, `reboot_server`, `reset_server`, `shutdown_server`, `rebuild_server`, `change_server_type`, `enable_server_rescue`, `disable_server_rescue`, `create_server_image`, `enable_server_backup`, `disable_server_backup`, `attach_iso_to_server`, `detach_iso_from_server`, `change_server_dns_ptr`, `change_server_protection`, `request_server_console`, `attach_server_to_network`, `detach_server_from_network`, `change_server_alias_ips`, `add_server_to_placement_group`, `remove_server_from_placement_group`, `list_server_actions`, `get_server_action`

### Volumes
`list_volumes`, `get_volume`, `create_volume`, `update_volume`, `delete_volume`, `attach_volume`, `detach_volume`, `resize_volume`, `change_volume_protection`, `list_volume_actions`

### Networks
`list_networks`, `get_network`, `create_network`, `update_network`, `delete_network`, `add_subnet_to_network`, `delete_subnet_from_network`, `add_route_to_network`, `delete_route_from_network`, `change_network_ip_range`, `change_network_protection`, `list_network_actions`

### Firewalls
`list_firewalls`, `get_firewall`, `create_firewall`, `update_firewall`, `delete_firewall`, `set_firewall_rules`, `apply_firewall_to_resources`, `remove_firewall_from_resources`, `list_firewall_actions`

### Floating IPs
`list_floating_ips`, `get_floating_ip`, `create_floating_ip`, `update_floating_ip`, `delete_floating_ip`, `assign_floating_ip`, `unassign_floating_ip`, `change_floating_ip_dns_ptr`, `change_floating_ip_protection`, `list_floating_ip_actions`

### Primary IPs
`list_primary_ips`, `get_primary_ip`, `create_primary_ip`, `update_primary_ip`, `delete_primary_ip`, `assign_primary_ip`, `unassign_primary_ip`, `change_primary_ip_dns_ptr`, `change_primary_ip_protection`

### Load Balancers
`list_load_balancers`, `get_load_balancer`, `create_load_balancer`, `update_load_balancer`, `delete_load_balancer`, `get_load_balancer_metrics`, `add_load_balancer_target`, `remove_load_balancer_target`, `add_load_balancer_service`, `update_load_balancer_service`, `delete_load_balancer_service`, `change_load_balancer_algorithm`, `change_load_balancer_type`, `change_load_balancer_protection`, `change_load_balancer_dns_ptr`, `attach_load_balancer_to_network`, `detach_load_balancer_from_network`, `enable_load_balancer_public_interface`, `disable_load_balancer_public_interface`, `list_load_balancer_actions`

### Certificates
`list_certificates`, `get_certificate`, `create_certificate`, `update_certificate`, `delete_certificate`, `retry_certificate_issuance`, `list_certificate_actions`

### SSH Keys
`list_ssh_keys`, `get_ssh_key`, `create_ssh_key`, `update_ssh_key`, `delete_ssh_key`

### Placement Groups
`list_placement_groups`, `get_placement_group`, `create_placement_group`, `update_placement_group`, `delete_placement_group`

### Reference Data
`list_server_types`, `get_server_type`, `list_images`, `get_image`, `update_image`, `delete_image`, `change_image_protection`, `list_image_actions`, `list_isos`, `get_iso`, `list_load_balancer_types`, `get_load_balancer_type`, `list_datacenters`, `get_datacenter`, `list_locations`, `get_location`, `get_pricing`, `list_actions`, `get_action`

### Storage Boxes
`list_storage_boxes`, `get_storage_box`, `update_storage_box`

## DNS API Tools (~15 tools)

`list_dns_zones`, `get_dns_zone`, `create_dns_zone`, `update_dns_zone`, `delete_dns_zone`, `validate_dns_zone_file`, `import_dns_zone`, `export_dns_zone`, `list_dns_records`, `get_dns_record`, `create_dns_record`, `update_dns_record`, `delete_dns_record`, `bulk_create_dns_records`, `bulk_update_dns_records`

## Robot API Tools (~55 tools)

### Servers
`list_robot_servers`, `get_robot_server`, `rename_robot_server`, `get_robot_server_cancellation`, `cancel_robot_server`, `withdraw_robot_server_cancellation`

### Reset & Wake-on-LAN
`list_robot_reset_options`, `get_robot_reset_options`, `reset_robot_server`, `get_robot_wol`, `send_robot_wol`

### Boot Configuration
`get_robot_boot_config`, `get_robot_rescue`, `enable_robot_rescue`, `disable_robot_rescue`, `get_robot_linux`, `enable_robot_linux`, `disable_robot_linux`, `get_robot_vnc`, `enable_robot_vnc`, `disable_robot_vnc`

### SSH Keys
`list_robot_ssh_keys`, `get_robot_ssh_key`, `create_robot_ssh_key`, `update_robot_ssh_key`, `delete_robot_ssh_key`

### IPs & Subnets
`list_robot_ips`, `get_robot_ip`, `update_robot_ip`, `get_robot_ip_mac`, `create_robot_ip_mac`, `delete_robot_ip_mac`, `list_robot_subnets`, `get_robot_subnet`, `update_robot_subnet`, `get_robot_subnet_mac`, `create_robot_subnet_mac`, `delete_robot_subnet_mac`

### Firewalls
`get_robot_firewall`, `set_robot_firewall`, `delete_robot_firewall`, `list_robot_firewall_templates`, `get_robot_firewall_template`, `create_robot_firewall_template`, `update_robot_firewall_template`, `delete_robot_firewall_template`

### vSwitch
`list_robot_vswitches`, `get_robot_vswitch`, `create_robot_vswitch`, `update_robot_vswitch`, `delete_robot_vswitch`, `add_robot_vswitch_server`, `remove_robot_vswitch_server`

### RDNS
`list_robot_rdns`, `get_robot_rdns`, `create_robot_rdns`, `update_robot_rdns`, `delete_robot_rdns`

### Traffic & Failover
`get_robot_traffic`, `list_robot_failover_ips`, `get_robot_failover_ip`, `route_robot_failover_ip`

## Development

```bash
npm run dev      # Run with tsx (hot reload)
npm run build    # Build with tsup
npm run lint     # Type check with tsc
npm test         # Run tests with vitest
```

## Architecture

```
src/
├── index.ts              # Entry point, stdio transport
├── server.ts             # MCP server setup, tool registrar
├── config.ts             # Environment variable loading
├── clients/
│   ├── common.ts         # Shared types, errors, helpers
│   ├── cloud.ts          # Cloud API client (Bearer auth, pagination, action polling)
│   └── robot.ts          # Robot API client (Basic auth, form-encoded, request queue)
├── types/
│   ├── cloud.ts          # Cloud API response types
│   ├── robot.ts          # Robot API response types
│   └── dns.ts            # DNS API response types
└── tools/                # 34 tool registration files
    ├── servers.ts         ├── robot-servers.ts
    ├── server-actions.ts  ├── robot-reset.ts
    ├── server-types.ts    ├── robot-wol.ts
    ├── images.ts          ├── robot-boot.ts
    ├── isos.ts            ├── robot-keys.ts
    ├── volumes.ts         ├── robot-ips.ts
    ├── networks.ts        ├── robot-subnets.ts
    ├── firewalls.ts       ├── robot-firewalls.ts
    ├── floating-ips.ts    ├── robot-vswitch.ts
    ├── primary-ips.ts     ├── robot-rdns.ts
    ├── load-balancers.ts  ├── robot-traffic.ts
    ├── load-balancer-types.ts ├── robot-failover.ts
    ├── certificates.ts    ├── dns-zones.ts
    ├── ssh-keys.ts        ├── dns-records.ts
    ├── placement-groups.ts
    ├── datacenters.ts
    ├── locations.ts
    ├── pricing.ts
    ├── actions.ts
    └── storage-boxes.ts
```

## License

MIT
