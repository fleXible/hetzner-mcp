export type HetznerMode = 'read_only' | 'read_write';

export type ToolGroup = 'cloud' | 'dns' | 'robot';
export const ALL_TOOL_GROUPS: ToolGroup[] = ['cloud', 'dns', 'robot'];

export interface CloudConfig {
  token: string;
  baseUrl: string;
}

export interface RobotConfig {
  user: string;
  password: string;
  baseUrl: string;
}

export interface HetznerConfig {
  cloud: CloudConfig | null;
  robot: RobotConfig | null;
  mode: HetznerMode;
  tools: Set<ToolGroup>;
}

export function loadConfig(): HetznerConfig {
  const cloudToken = process.env.HETZNER_CLOUD_TOKEN;
  const robotUser = process.env.HETZNER_ROBOT_USER;
  const robotPassword = process.env.HETZNER_ROBOT_PASSWORD;
  const rawMode = process.env.HETZNER_MODE ?? 'read_only';

  if (!cloudToken && !(robotUser && robotPassword)) {
    console.error(
      'ERROR: No Hetzner credentials configured.\n' +
      'Set HETZNER_CLOUD_TOKEN for Cloud/DNS API access, and/or\n' +
      'Set HETZNER_ROBOT_USER + HETZNER_ROBOT_PASSWORD for Robot API access.'
    );
    process.exit(1);
  }

  if (rawMode !== 'read_only' && rawMode !== 'read_write') {
    console.error('ERROR: HETZNER_MODE must be "read_only" or "read_write". Got: ' + rawMode);
    process.exit(1);
  }

  const mode = rawMode as HetznerMode;

  // Parse HETZNER_TOOLS — comma-separated list of groups to enable.
  // Defaults to all groups that have credentials configured.
  const rawTools = process.env.HETZNER_TOOLS;
  let tools: Set<ToolGroup>;
  if (rawTools) {
    const requested = rawTools.split(',').map((s) => s.trim().toLowerCase());
    const invalid = requested.filter((g) => !(ALL_TOOL_GROUPS as string[]).includes(g));
    if (invalid.length > 0) {
      console.error(
        `ERROR: HETZNER_TOOLS contains unknown group(s): ${invalid.join(', ')}\n` +
        `Valid groups: ${ALL_TOOL_GROUPS.join(', ')}`
      );
      process.exit(1);
    }
    tools = new Set(requested as ToolGroup[]);
  } else {
    // Default: enable all groups that have credentials available
    tools = new Set<ToolGroup>();
    if (cloudToken) {
      tools.add('cloud');
      tools.add('dns');
    }
    if (robotUser && robotPassword) {
      tools.add('robot');
    }
  }

  return {
    cloud: cloudToken
      ? {
          token: cloudToken,
          baseUrl: process.env.HETZNER_CLOUD_URL ?? 'https://api.hetzner.cloud/v1',
        }
      : null,
    robot:
      robotUser && robotPassword
        ? {
            user: robotUser,
            password: robotPassword,
            baseUrl: process.env.HETZNER_ROBOT_URL ?? 'https://robot-ws.your-server.de',
          }
        : null,
    mode,
    tools,
  };
}

export function describeConfig(config: HetznerConfig): string {
  const lines: string[] = [`Mode: ${config.mode}`];
  if (config.cloud) {
    lines.push('Cloud API: configured');
  } else {
    lines.push('Cloud API: not configured (set HETZNER_CLOUD_TOKEN)');
  }
  if (config.robot) {
    lines.push(`Robot API: configured (user: ${config.robot.user})`);
  } else {
    lines.push('Robot API: not configured (set HETZNER_ROBOT_USER + HETZNER_ROBOT_PASSWORD)');
  }
  lines.push(`Tool groups enabled: ${[...config.tools].join(', ') || 'none'}`);
  return lines.join('\n');
}
