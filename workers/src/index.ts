import { createSession, requireSession, revokeSession, upsertAccount, verifyGoogleIdToken } from './auth';
import { handleError, HttpError, jsonResponse, optionsResponse, readJson } from './http';
import {
  createBucket,
  createCalendarEvent,
  createContainer,
  createLabel,
  createPlan,
  createTask,
  deleteBucket,
  deleteCalendarEvent,
  deleteContainer,
  deleteLabel,
  deletePlan,
  deleteTask,
  getBucket,
  getCalendarEvent,
  getContainer,
  getLabel,
  getPlan,
  getSettings,
  getTask,
  listBuckets,
  listCalendarEvents,
  listContainers,
  listLabels,
  listPlans,
  listTasks,
  updateBucket,
  updateCalendarEvent,
  updateContainer,
  updateLabel,
  updatePlan,
  updateSettings,
  updateTask
} from './repositories';
import { importSnapshot, listMigrationConflicts, resolveMigrationConflict } from './migration';
import { validateOfflineMutationReplay } from './offlineMutations';
import { listSyncChanges } from './sync';
import { getSyncConflict, listSyncConflicts } from './syncConflicts';
import { buildSyncMutationDryRun } from './syncMutationDryRun';
import { buildSyncReplayEnablementSimulation } from './syncReplayEnablementSimulation';
import { buildSyncReplayReadinessSummary } from './syncReplayReadiness';
import { applyTaskReplayTestOnly } from './syncMutationTaskReplay';
import { getSyncMutationOutcome, listSyncMutationOutcomes, recordSyncMutationOutcomes } from './syncMutationOutcomes';
import { attachTaskReplayTransactionSkeleton } from './taskReplayTransaction';
import type { Env } from './types';

type Handler = (request: Request, env: Env, url: URL) => Promise<Response>;

const routes: Array<{ method: string; pattern: RegExp; handler: Handler }> = [
  { method: 'GET', pattern: /^\/health$/, handler: async (_request, env) => jsonResponse({ service: 'timewhere-api', env: env.TIMEWHERE_ENV || 'unknown' }) },
  { method: 'POST', pattern: /^\/auth\/google$/, handler: handleGoogleAuth },
  { method: 'DELETE', pattern: /^\/auth\/session$/, handler: handleDeleteSession },
  { method: 'GET', pattern: /^\/account\/me$/, handler: handleAccountMe },
  { method: 'GET', pattern: /^\/tasks$/, handler: handleListTasks },
  { method: 'POST', pattern: /^\/tasks$/, handler: handleCreateTask },
  { method: 'GET', pattern: /^\/tasks\/([^/]+)$/, handler: handleGetTask },
  { method: 'PATCH', pattern: /^\/tasks\/([^/]+)$/, handler: handleUpdateTask },
  { method: "DELETE", pattern: /^\/tasks\/([^/]+)$/, handler: handleDeleteTask },
  { method: "GET", pattern: /^\/calendar\/events$/, handler: handleListCalendarEvents },
  { method: "POST", pattern: /^\/calendar\/events$/, handler: handleCreateCalendarEvent },
  { method: "GET", pattern: /^\/calendar\/events\/([^/]+)$/, handler: handleGetCalendarEvent },
  { method: "PATCH", pattern: /^\/calendar\/events\/([^/]+)$/, handler: handleUpdateCalendarEvent },
  { method: "DELETE", pattern: /^\/calendar\/events\/([^/]+)$/, handler: handleDeleteCalendarEvent },
  { method: "GET", pattern: /^\/plans$/, handler: handleListPlans },
  { method: "POST", pattern: /^\/plans$/, handler: handleCreatePlan },
  { method: "GET", pattern: /^\/plans\/([^/]+)$/, handler: handleGetPlan },
  { method: "PATCH", pattern: /^\/plans\/([^/]+)$/, handler: handleUpdatePlan },
  { method: "DELETE", pattern: /^\/plans\/([^/]+)$/, handler: handleDeletePlan },
  { method: "GET", pattern: /^\/buckets$/, handler: handleListBuckets },
  { method: "POST", pattern: /^\/buckets$/, handler: handleCreateBucket },
  { method: "GET", pattern: /^\/buckets\/([^/]+)$/, handler: handleGetBucket },
  { method: "PATCH", pattern: /^\/buckets\/([^/]+)$/, handler: handleUpdateBucket },
  { method: "DELETE", pattern: /^\/buckets\/([^/]+)$/, handler: handleDeleteBucket },
  { method: "GET", pattern: /^\/labels$/, handler: handleListLabels },
  { method: "POST", pattern: /^\/labels$/, handler: handleCreateLabel },
  { method: "GET", pattern: /^\/labels\/([^/]+)$/, handler: handleGetLabel },
  { method: "PATCH", pattern: /^\/labels\/([^/]+)$/, handler: handleUpdateLabel },
  { method: "DELETE", pattern: /^\/labels\/([^/]+)$/, handler: handleDeleteLabel },
  { method: "GET", pattern: /^\/containers$/, handler: handleListContainers },
  { method: "POST", pattern: /^\/containers$/, handler: handleCreateContainer },
  { method: "GET", pattern: /^\/containers\/([^/]+)$/, handler: handleGetContainer },
  { method: "PATCH", pattern: /^\/containers\/([^/]+)$/, handler: handleUpdateContainer },
  { method: "DELETE", pattern: /^\/containers\/([^/]+)$/, handler: handleDeleteContainer },
  { method: 'GET', pattern: /^\/settings$/, handler: handleGetSettings },
  { method: 'PUT', pattern: /^\/settings$/, handler: handleUpdateSettings },
  { method: 'POST', pattern: /^\/migration\/runs$/, handler: handleCreateMigrationRun },
  { method: 'GET', pattern: /^\/migration\/conflicts$/, handler: handleListMigrationConflicts },
  { method: 'PATCH', pattern: /^\/migration\/conflicts\/([^/]+)$/, handler: handleResolveMigrationConflict },
  { method: 'GET', pattern: /^\/sync\/changes$/, handler: handleListSyncChanges },
  { method: 'GET', pattern: /^\/sync\/mutations$/, handler: handleListSyncMutationOutcomes },
  { method: 'POST', pattern: /^\/sync\/mutations$/, handler: handleSyncMutations },
  { method: 'POST', pattern: /^\/sync\/mutations\/dry-run$/, handler: handleSyncMutationDryRun },
  { method: 'POST', pattern: /^\/sync\/mutations\/enablement-simulation$/, handler: handleSyncReplayEnablementSimulation },
  { method: 'POST', pattern: /^\/sync\/mutations\/readiness-summary$/, handler: handleSyncReplayReadinessSummary },
  { method: 'GET', pattern: /^\/sync\/mutations\/([^/]+)$/, handler: handleGetSyncMutationOutcome },
  { method: 'GET', pattern: /^\/sync\/conflicts$/, handler: handleListSyncConflicts },
  { method: 'GET', pattern: /^\/sync\/conflicts\/([^/]+)$/, handler: handleGetSyncConflict },
  { method: 'GET', pattern: /^\/sync\/status$/, handler: handleSyncStatus }
];

async function handleGoogleAuth(request: Request, env: Env): Promise<Response> {
  const body = await readJson<{ id_token?: string }>(request);
  const identity = await verifyGoogleIdToken(env, body.id_token || '');
  const account = await upsertAccount(env, identity);
  const session = await createSession(env, account.accountId);
  return jsonResponse({
    account: {
      id: account.accountId,
      email: identity.email || null,
      name: identity.name || 'Google User',
      picture: identity.picture || null
    },
    session
  });
}

async function handleAccountMe(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(env, request);
  const account = await env.DB.prepare(
    'SELECT id, email, display_name, picture_url, created_at, updated_at FROM accounts WHERE id = ?'
  ).bind(session.accountId).first();
  return jsonResponse({ account });
}

async function handleDeleteSession(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(env, request);
  await revokeSession(env, session.sessionId);
  return jsonResponse({ disconnected: true });
}

async function handleListTasks(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  const includeCompleted = url.searchParams.get('include_completed') === 'true';
  const progress = url.searchParams.get('progress');
  const search = url.searchParams.get('search');
  return jsonResponse({ tasks: await listTasks(env, session.accountId, { includeCompleted, progress, search }) });
}

async function handleCreateTask(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(env, request);
  const body = await readJson<Record<string, unknown>>(request);
  return jsonResponse({ task: await createTask(env, session.accountId, body) }, { status: 201 });
}

async function handleGetTask(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  const id = url.pathname.split('/').pop() || '';
  return jsonResponse({ task: await getTask(env, session.accountId, id) });
}

async function handleUpdateTask(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  const id = url.pathname.split('/').pop() || '';
  const body = await readJson<Record<string, unknown>>(request);
  return jsonResponse({ task: await updateTask(env, session.accountId, id, body) });
}

async function handleDeleteTask(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  const id = url.pathname.split('/').pop() || '';
  return jsonResponse(await deleteTask(env, session.accountId, id));
}

async function handleListCalendarEvents(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  return jsonResponse({
    events: await listCalendarEvents(env, session.accountId, {
      dateFrom: url.searchParams.get("date_from"),
      dateTo: url.searchParams.get("date_to"),
      search: url.searchParams.get("search")
    })
  });
}

async function handleCreateCalendarEvent(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(env, request);
  const body = await readJson<Record<string, unknown>>(request);
  return jsonResponse({ event: await createCalendarEvent(env, session.accountId, body) }, { status: 201 });
}

async function handleGetCalendarEvent(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  const id = url.pathname.split("/").pop() || "";
  return jsonResponse({ event: await getCalendarEvent(env, session.accountId, id) });
}

async function handleUpdateCalendarEvent(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  const id = url.pathname.split("/").pop() || "";
  const body = await readJson<Record<string, unknown>>(request);
  return jsonResponse({ event: await updateCalendarEvent(env, session.accountId, id, body) });
}

async function handleDeleteCalendarEvent(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  const id = url.pathname.split("/").pop() || "";
  return jsonResponse(await deleteCalendarEvent(env, session.accountId, id));
}

async function handleListPlans(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  return jsonResponse({ plans: await listPlans(env, session.accountId, { search: url.searchParams.get("search") }) });
}

async function handleCreatePlan(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(env, request);
  const body = await readJson<Record<string, unknown>>(request);
  return jsonResponse({ plan: await createPlan(env, session.accountId, body) }, { status: 201 });
}

async function handleGetPlan(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  const id = url.pathname.split("/").pop() || "";
  return jsonResponse({ plan: await getPlan(env, session.accountId, id) });
}

async function handleUpdatePlan(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  const id = url.pathname.split("/").pop() || "";
  const body = await readJson<Record<string, unknown>>(request);
  return jsonResponse({ plan: await updatePlan(env, session.accountId, id, body) });
}

async function handleDeletePlan(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  const id = url.pathname.split("/").pop() || "";
  return jsonResponse(await deletePlan(env, session.accountId, id));
}
async function handleListBuckets(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  return jsonResponse({ buckets: await listBuckets(env, session.accountId, { search: url.searchParams.get("search") }) });
}

async function handleCreateBucket(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(env, request);
  const body = await readJson<Record<string, unknown>>(request);
  return jsonResponse({ bucket: await createBucket(env, session.accountId, body) }, { status: 201 });
}

async function handleGetBucket(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  const id = url.pathname.split("/").pop() || "";
  return jsonResponse({ bucket: await getBucket(env, session.accountId, id) });
}

async function handleUpdateBucket(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  const id = url.pathname.split("/").pop() || "";
  const body = await readJson<Record<string, unknown>>(request);
  return jsonResponse({ bucket: await updateBucket(env, session.accountId, id, body) });
}

async function handleDeleteBucket(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  const id = url.pathname.split("/").pop() || "";
  return jsonResponse(await deleteBucket(env, session.accountId, id));
}

async function handleListLabels(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  return jsonResponse({ labels: await listLabels(env, session.accountId, { search: url.searchParams.get("search") }) });
}

async function handleCreateLabel(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(env, request);
  const body = await readJson<Record<string, unknown>>(request);
  return jsonResponse({ label: await createLabel(env, session.accountId, body) }, { status: 201 });
}

async function handleGetLabel(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  const id = url.pathname.split("/").pop() || "";
  return jsonResponse({ label: await getLabel(env, session.accountId, id) });
}

async function handleUpdateLabel(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  const id = url.pathname.split("/").pop() || "";
  const body = await readJson<Record<string, unknown>>(request);
  return jsonResponse({ label: await updateLabel(env, session.accountId, id, body) });
}

async function handleDeleteLabel(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  const id = url.pathname.split("/").pop() || "";
  return jsonResponse(await deleteLabel(env, session.accountId, id));
}
async function handleListContainers(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  return jsonResponse({ containers: await listContainers(env, session.accountId, { search: url.searchParams.get("search") }) });
}

async function handleCreateContainer(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(env, request);
  const body = await readJson<Record<string, unknown>>(request);
  return jsonResponse({ container: await createContainer(env, session.accountId, body) }, { status: 201 });
}

async function handleGetContainer(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  const id = url.pathname.split("/").pop() || "";
  return jsonResponse({ container: await getContainer(env, session.accountId, id) });
}

async function handleUpdateContainer(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  const id = url.pathname.split("/").pop() || "";
  const body = await readJson<Record<string, unknown>>(request);
  return jsonResponse({ container: await updateContainer(env, session.accountId, id, body) });
}

async function handleDeleteContainer(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  const id = url.pathname.split("/").pop() || "";
  return jsonResponse(await deleteContainer(env, session.accountId, id));
}
async function handleGetSettings(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(env, request);
  return jsonResponse({ settings: await getSettings(env, session.accountId) });
}

async function handleUpdateSettings(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(env, request);
  const body = await readJson<Record<string, unknown>>(request);
  return jsonResponse({ settings: await updateSettings(env, session.accountId, body) });
}

async function handleCreateMigrationRun(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(env, request);
  const body = await readJson<{ snapshot?: unknown; source_runtime?: string }>(request);
  return jsonResponse({
    migration: await importSnapshot(env, session.accountId, body.snapshot || {}, body.source_runtime || 'webdev')
  }, { status: 201 });
}

async function handleListMigrationConflicts(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  return jsonResponse({ conflicts: await listMigrationConflicts(env, session.accountId, url.searchParams.get('status') || 'open') });
}

async function handleResolveMigrationConflict(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  const id = url.pathname.split('/').pop() || '';
  const body = await readJson<{ resolution?: string }>(request);
  return jsonResponse({ conflict: await resolveMigrationConflict(env, session.accountId, id, body.resolution || 'resolved') });
}

async function handleSyncStatus(request: Request, env: Env): Promise<Response> {
  await requireSession(env, request);
  return jsonResponse({
    mode: 'cloud_canonical',
    offline_writes: 'blocked_v1',
    cache: 'read_only_when_offline',
    change_feed: 'available',
    mutation_replay: 'disabled_v1',
    task_replay_gate: 'defined_disabled_v1',
    task_replay_transaction: 'internal_disabled_v1',
    mutation_dry_run: 'internal_disabled_v1',
    replay_enablement_simulation: 'internal_disabled_v1',
    replay_readiness_summary: 'internal_disabled_v1',
    mutation_outcomes: 'metadata_only_disabled_v1',
    conflict_records: 'scaffolded'
  });
}

async function handleListSyncChanges(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  return jsonResponse(await listSyncChanges(
    env,
    session.accountId,
    url.searchParams.get('cursor'),
    url.searchParams.get('limit')
  ));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isTestOnlyTaskReplayRequest(body: unknown): boolean {
  return isRecord(body) && body.test_only_task_replay_enabled === true;
}

async function handleSyncMutations(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(env, request);
  const body = await readJson<unknown>(request);
  const replay = isTestOnlyTaskReplayRequest(body)
    ? await applyTaskReplayTestOnly(env, session.accountId, body)
    : attachTaskReplayTransactionSkeleton(validateOfflineMutationReplay(body));
  return jsonResponse({
    replay,
    outcome_persistence: await recordSyncMutationOutcomes(env, session.accountId, replay)
  });
}

async function handleSyncMutationDryRun(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(env, request);
  const body = await readJson<unknown>(request);
  return jsonResponse(await buildSyncMutationDryRun(env, session.accountId, body));
}

async function handleSyncReplayEnablementSimulation(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(env, request);
  const body = await readJson<unknown>(request);
  return jsonResponse(await buildSyncReplayEnablementSimulation(env, session.accountId, body));
}

async function handleSyncReplayReadinessSummary(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(env, request);
  const body = await readJson<unknown>(request);
  return jsonResponse(await buildSyncReplayReadinessSummary(env, session.accountId, body));
}

async function handleListSyncMutationOutcomes(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  return jsonResponse(await listSyncMutationOutcomes(
    env,
    session.accountId,
    url.searchParams.get('status'),
    url.searchParams.get('limit')
  ));
}

async function handleGetSyncMutationOutcome(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  const id = url.pathname.split('/').pop() || '';
  return jsonResponse({ outcome: await getSyncMutationOutcome(env, session.accountId, id) });
}

async function handleListSyncConflicts(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  return jsonResponse(await listSyncConflicts(
    env,
    session.accountId,
    url.searchParams.get('status'),
    url.searchParams.get('limit')
  ));
}

async function handleGetSyncConflict(request: Request, env: Env, url: URL): Promise<Response> {
  const session = await requireSession(env, request);
  const id = url.pathname.split('/').pop() || '';
  return jsonResponse({ conflict: await getSyncConflict(env, session.accountId, id) });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return optionsResponse();
    const url = new URL(request.url);
    const route = routes.find(candidate => candidate.method === request.method && candidate.pattern.test(url.pathname));
    if (!route) {
      return handleError(new HttpError(404, 'route_not_found', 'Route not found'));
    }
    try {
      return await route.handler(request, env, url);
    } catch (error) {
      return handleError(error);
    }
  }
};
