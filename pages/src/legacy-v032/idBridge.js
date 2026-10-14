import { createLegacyCloudRuntime } from './cloudRuntime.js';

const ID_MAP_KEY = 'timewhere.web.legacy.id-map.v032';

function readMap() {
  try { return JSON.parse(localStorage.getItem(ID_MAP_KEY) || 'null') || { next: 1, byKind: {} }; }
  catch { return { next: 1, byKind: {} }; }
}

function aliasId(kind, cloudId) {
  if (cloudId === null || cloudId === undefined || cloudId === '') return null;
  if (typeof cloudId === 'number') return cloudId;
  const state = readMap();
  state.byKind[kind] ||= {};
  const key = String(cloudId);
  if (!state.byKind[kind][key]) {
    state.byKind[kind][key] = state.next++;
    localStorage.setItem(ID_MAP_KEY, JSON.stringify(state));
  }
  return state.byKind[kind][key];
}

function cloudId(kind, value) {
  if (value === null || value === undefined || value === '') return null;
  const entries = Object.entries(readMap().byKind?.[kind] || {});
  return entries.find(([, alias]) => String(alias) === String(value))?.[0] || String(value);
}

function toLegacy(kind, item) {
  if (!item) return item;
  const next = { ...item, id: aliasId(kind, item.id) };
  if ('plan_id' in next) next.plan_id = aliasId('plan', next.plan_id);
  if ('bucket_id' in next) next.bucket_id = aliasId('bucket', next.bucket_id);
  if ('container_id' in next) next.container_id = aliasId('container', next.container_id);
  if (Array.isArray(next.labels)) next.labels = next.labels.map(id => aliasId('label', id));
  return next;
}

function toCloud(input = {}) {
  const next = { ...input };
  if ('plan_id' in next) next.plan_id = cloudId('plan', next.plan_id);
  if ('bucket_id' in next) next.bucket_id = cloudId('bucket', next.bucket_id);
  if ('container_id' in next) next.container_id = cloudId('container', next.container_id);
  if (Array.isArray(next.labels)) next.labels = next.labels.map(id => cloudId('label', id));
  return next;
}

export function createLegacyCloudRuntimeWithIdBridge() {
  const runtime = createLegacyCloudRuntime();
  const base = runtime.facade;
  const facade = Object.create(base);

  facade.getAllTasks = async () => (await base.getAllTasks()).map(item => toLegacy('task', item));
  facade.getTaskById = async id => (await facade.getAllTasks()).find(item => String(item.id) === String(id)) || null;
  facade.getTasksByPlan = async planId => (await base.getTasksByPlan(cloudId('plan', planId))).map(item => toLegacy('task', item));
  facade.addTask = async input => toLegacy('task', await base.addTask(toCloud(input)));
  facade.updateTask = async (id, patch) => toLegacy('task', await base.updateTask(cloudId('task', id), toCloud(patch)));
  facade.deleteTask = id => base.deleteTask(cloudId('task', id));
  facade.updateChecklist = (id, checklist) => facade.updateTask(id, { checklist });

  facade.getPlans = async () => (await base.getPlans()).map(item => toLegacy('plan', item));
  facade.getBucketsByPlan = async planId => (await base.getBucketsByPlan(cloudId('plan', planId))).map(item => toLegacy('bucket', item));
  facade.getLabelsByPlan = async planId => (await base.getLabelsByPlan(cloudId('plan', planId))).map(item => toLegacy('label', item));
  facade.getContainers = async options => (await base.getContainers(options)).map(item => toLegacy('container', item));
  facade.getContainerById = async id => (await facade.getContainers()).find(item => String(item.id) === String(id)) || null;

  facade.addPlan = async input => toLegacy('plan', await base.addPlan(toCloud(input)));
  facade.updatePlan = async (id, patch) => toLegacy('plan', await base.updatePlan(cloudId('plan', id), toCloud(patch)));
  facade.deletePlan = id => base.deletePlan(cloudId('plan', id));
  facade.reorderPlans = ids => base.reorderPlans(ids.map(id => cloudId('plan', id)));
  facade.ensureDefaultPlan = async () => toLegacy('plan', await base.ensureDefaultPlan());
  facade.addBucket = async input => toLegacy('bucket', await base.addBucket(toCloud(input)));
  facade.updateBucket = async (id, patch) => toLegacy('bucket', await base.updateBucket(cloudId('bucket', id), toCloud(patch)));
  facade.deleteBucket = id => base.deleteBucket(cloudId('bucket', id));
  facade.ensureBucketTemplateForPlan = async (id, names) => (await base.ensureBucketTemplateForPlan(cloudId('plan', id), names)).map(item => toLegacy('bucket', item));
  facade.addLabel = async input => toLegacy('label', await base.addLabel(toCloud(input)));
  facade.updateLabel = async (id, patch) => toLegacy('label', await base.updateLabel(cloudId('label', id), toCloud(patch)));
  facade.deleteLabel = id => base.deleteLabel(cloudId('label', id));
  facade.addContainer = async input => toLegacy('container', await base.addContainer(toCloud(input)));
  facade.updateContainer = async (id, patch) => toLegacy('container', await base.updateContainer(cloudId('container', id), toCloud(patch)));
  facade.deleteContainer = id => base.deleteContainer(cloudId('container', id));

  facade.getEvents = async () => (await base.getEvents()).map(item => toLegacy('event', item));
  facade.getEventsByDateRange = async (start, end) => (await base.getEventsByDateRange(start, end)).map(item => toLegacy('event', item));
  facade.getEventById = async id => (await facade.getEvents()).find(item => String(item.id) === String(id)) || null;
  facade.addEvent = async input => toLegacy('event', await base.addEvent(toCloud(input)));
  facade.updateEvent = async (id, patch) => toLegacy('event', await base.updateEvent(cloudId('event', id), toCloud(patch)));
  facade.deleteEvent = id => base.deleteEvent(cloudId('event', id));
  facade.prepareExtensionBackup = file => runtime.prepareExtensionBackup(file);
  facade.commitExtensionBackup = prepared => runtime.commitExtensionBackup(prepared);
  facade.importExtensionBackup = file => runtime.importExtensionBackup(file);
  facade.getMigrationConflicts = () => runtime.getMigrationConflicts();
  facade.resolveMigrationConflict = (id, resolution) => runtime.resolveMigrationConflict(id, resolution);

  return { ...runtime, facade };
}
