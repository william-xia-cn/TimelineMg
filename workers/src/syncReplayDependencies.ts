import { validateOfflineMutationBatch, type ValidatedMutation } from './offlineMutations';

type DependencyStatus = 'satisfied' | 'requires_cloud_validation' | 'blocked';

type DependencyRef = {
  field: string;
  entity_type: string;
  entity_id: string;
};

type IndexedMutation = {
  mutation: ValidatedMutation;
  index: number;
};

type DependencyRow = {
  field: string;
  entity_type: string;
  entity_id: string;
  status: DependencyStatus;
  reason: string;
  source: string;
};

function mutationKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

function firstIndexesByOperation(mutations: ValidatedMutation[], operation: string): Map<string, number> {
  const indexes = new Map<string, number>();
  mutations.forEach((mutation, index) => {
    if (mutation.operation !== operation) return;
    const key = mutationKey(mutation.entity_type, mutation.entity_id);
    if (!indexes.has(key)) indexes.set(key, index);
  });
  return indexes;
}

function patchOrBaseValue(mutation: ValidatedMutation, field: string): unknown {
  if (Object.prototype.hasOwnProperty.call(mutation.patch, field)) {
    return mutation.patch[field];
  }
  return mutation.base_values[field];
}

function stringRef(mutation: ValidatedMutation, field: string, entityType: string): DependencyRef | null {
  const value = patchOrBaseValue(mutation, field);
  return typeof value === 'string' && value.trim()
    ? { field, entity_type: entityType, entity_id: value.trim() }
    : null;
}

function labelRefs(mutation: ValidatedMutation): DependencyRef[] {
  const value = patchOrBaseValue(mutation, 'labels');
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(item => typeof item === 'string' && item.trim()).map(String)))
    .map(entityId => ({ field: 'labels', entity_type: 'label', entity_id: entityId }));
}

function relationshipRefs(mutation: ValidatedMutation): DependencyRef[] {
  const refs: Array<DependencyRef | null> = [];
  if (mutation.entity_type === 'task') {
    refs.push(stringRef(mutation, 'plan_id', 'plan'));
    refs.push(stringRef(mutation, 'bucket_id', 'bucket'));
    refs.push(stringRef(mutation, 'container_id', 'container'));
    refs.push(...labelRefs(mutation));
  }
  if (mutation.entity_type === 'calendar_event') {
    refs.push(stringRef(mutation, 'container_id', 'container'));
  }
  if (mutation.entity_type === 'container' || mutation.entity_type === 'bucket' || mutation.entity_type === 'label') {
    refs.push(stringRef(mutation, 'plan_id', 'plan'));
  }
  return refs.filter(Boolean) as DependencyRef[];
}

function dependencyFor(
  ref: DependencyRef,
  mutationIndex: number,
  creates: Map<string, number>,
  deletes: Map<string, number>
): DependencyRow {
  const key = mutationKey(ref.entity_type, ref.entity_id);
  const createIndex = creates.get(key);
  const deleteIndex = deletes.get(key);
  if (typeof deleteIndex === 'number' && deleteIndex <= mutationIndex) {
    return {
      ...ref,
      status: 'blocked',
      reason: 'dependency_deleted_before_reference',
      source: 'same_batch'
    };
  }
  if (typeof createIndex === 'number') {
    if (createIndex < mutationIndex) {
      return {
        ...ref,
        status: 'satisfied',
        reason: 'same_batch_create',
        source: 'same_batch'
      };
    }
    return {
      ...ref,
      status: 'blocked',
      reason: createIndex === mutationIndex ? 'self_reference_create_not_allowed' : 'same_batch_create_after_reference',
      source: 'same_batch'
    };
  }
  if (typeof deleteIndex === 'number' && deleteIndex > mutationIndex) {
    return {
      ...ref,
      status: 'blocked',
      reason: 'dependency_deleted_later_in_batch',
      source: 'same_batch'
    };
  }
  return {
    ...ref,
    status: 'requires_cloud_validation',
    reason: 'requires_cloud_relationship_validation',
    source: 'cloud'
  };
}

function entityExistenceDependency(
  indexed: IndexedMutation,
  creates: Map<string, number>
): DependencyRow | null {
  const { mutation, index } = indexed;
  const key = mutationKey(mutation.entity_type, mutation.entity_id);
  const createIndex = creates.get(key);
  if (mutation.operation === 'create') {
    if (typeof createIndex === 'number' && createIndex < index) {
      return {
        field: 'entity_id',
        entity_type: mutation.entity_type,
        entity_id: mutation.entity_id,
        status: 'blocked',
        reason: 'duplicate_create_in_batch',
        source: 'same_batch'
      };
    }
    return null;
  }
  if (typeof createIndex === 'number' && createIndex < index) {
    return {
      field: 'entity_id',
      entity_type: mutation.entity_type,
      entity_id: mutation.entity_id,
      status: 'satisfied',
      reason: 'same_batch_create',
      source: 'same_batch'
    };
  }
  if (typeof createIndex === 'number' && createIndex > index) {
    return {
      field: 'entity_id',
      entity_type: mutation.entity_type,
      entity_id: mutation.entity_id,
      status: 'blocked',
      reason: 'same_batch_create_after_reference',
      source: 'same_batch'
    };
  }
  return {
    field: 'entity_id',
    entity_type: mutation.entity_type,
    entity_id: mutation.entity_id,
    status: 'requires_cloud_validation',
    reason: 'requires_cloud_entity_validation',
    source: 'cloud'
  };
}

function rowStatus(dependencies: DependencyRow[]): DependencyStatus {
  if (dependencies.some(dependency => dependency.status === 'blocked')) return 'blocked';
  if (dependencies.some(dependency => dependency.status === 'requires_cloud_validation')) return 'requires_cloud_validation';
  return 'satisfied';
}

function reasonCounts(rows: DependencyRow[]): Array<{ reason: string; count: number }> {
  const counts = new Map<string, number>();
  rows.forEach(row => counts.set(row.reason, (counts.get(row.reason) || 0) + 1));
  return Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason));
}

export function buildSyncReplayDependencyAnalysis(body: unknown): Record<string, unknown> {
  const mutations = validateOfflineMutationBatch(body);
  const creates = firstIndexesByOperation(mutations, 'create');
  const deletes = firstIndexesByOperation(mutations, 'delete');
  const rows = mutations.map((mutation, index) => {
    const dependencies = [
      entityExistenceDependency({ mutation, index }, creates),
      ...relationshipRefs(mutation).map(ref => dependencyFor(ref, index, creates, deletes))
    ].filter(Boolean) as DependencyRow[];
    return {
      mutation_id: mutation.mutation_id,
      entity_type: mutation.entity_type,
      entity_id: mutation.entity_id,
      operation: mutation.operation,
      status: rowStatus(dependencies),
      dependencies
    };
  });
  const dependencies = rows.flatMap(row => row.dependencies);
  return {
    mode: 'phase7_dependency_analysis_v1',
    writes_enabled: false,
    applies_user_data: false,
    user_enablement: false,
    validated_count: mutations.length,
    summary: {
      satisfied_count: rows.filter(row => row.status === 'satisfied').length,
      requires_cloud_validation_count: rows.filter(row => row.status === 'requires_cloud_validation').length,
      blocked_count: rows.filter(row => row.status === 'blocked').length,
      dependency_reason_counts: reasonCounts(dependencies)
    },
    rows
  };
}
