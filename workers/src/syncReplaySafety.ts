import type { Env } from './types';

function normalizedEnv(value: string | undefined): string {
  return String(value || 'unknown').trim().toLowerCase() || 'unknown';
}

function isProdEnv(value: string): boolean {
  return ['prod', 'production'].includes(value);
}

function switchIsOff(value: string | undefined): boolean {
  return ['off', 'false', '0', 'disabled'].includes(String(value || '').trim().toLowerCase());
}

function flagIsEnabled(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(String(value || '').trim().toLowerCase());
}

export function buildSyncReplaySafetyGate(env: Env): Record<string, unknown> {
  const envName = normalizedEnv(env.TIMEWHERE_ENV);
  const killSwitchActive = !switchIsOff(env.TIMEWHERE_TASK_REPLAY_KILL_SWITCH);
  const localDevFlagEnabled = flagIsEnabled(env.TIMEWHERE_TASK_REPLAY_LOCAL_DEV_ENABLED);
  const prod = isProdEnv(envName);
  const localDevEnvironment = ['dev', 'local', 'test', 'preview'].includes(envName);
  const localDevReplayAllowed = localDevEnvironment && localDevFlagEnabled && !killSwitchActive && !prod;
  const blockers = [];
  if (killSwitchActive) blockers.push('task_replay_kill_switch_active');
  if (prod) blockers.push('prod_replay_requires_separate_approval');
  if (!localDevFlagEnabled) blockers.push('local_dev_replay_flag_disabled');
  if (!localDevEnvironment) blockers.push('environment_not_local_dev_or_preview');

  return {
    mode: 'phase4_replay_safety_gate_v1',
    environment: envName,
    kill_switch_active: killSwitchActive,
    local_dev_flag_enabled: localDevFlagEnabled,
    local_dev_replay_allowed: localDevReplayAllowed,
    prod_replay_allowed: false,
    writes_enabled: false,
    applies_user_data: false,
    can_run_replay: false,
    blockers,
    recommendation: localDevReplayAllowed
      ? 'Local/dev safety preconditions are visible, but replay writes remain disabled until a separately approved implementation changes writes_enabled.'
      : 'Keep Task replay disabled. Clear blockers only for local/dev safety testing; production replay remains separately approved.'
  };
}
