export function createMigrationRepository(apiClient) {
  return {
    async createMigrationRun(snapshot, sourceRuntime = 'webdev') {
      const data = await apiClient.request('/migration/runs', {
        method: 'POST',
        body: { snapshot, source_runtime: sourceRuntime }
      });
      return data.migration;
    },
    async listConflicts(status = 'open') {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      const data = await apiClient.request(`/migration/conflicts?${params.toString()}`, { method: 'GET' });
      return data.conflicts || [];
    },
    async resolveConflict(id, resolution = 'resolved') {
      const data = await apiClient.request(`/migration/conflicts/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: { resolution }
      });
      return data.conflict;
    },
    async previewReplacement(snapshot, sourceRuntime = 'extension_json_export_v1') {
      const data = await apiClient.request('/migration/replacements/preview', {
        method: 'POST',
        body: { snapshot, source_runtime: sourceRuntime }
      });
      return data.replacement;
    },
    async commitReplacement(id, confirmation) {
      const data = await apiClient.request(`/migration/replacements/${encodeURIComponent(id)}/commit`, {
        method: 'POST',
        body: { confirmation }
      });
      return data.replacement;
    },
    async listReplacements() {
      const data = await apiClient.request('/migration/replacements', { method: 'GET' });
      return data.replacements || [];
    },
    async previewRollback(id) {
      const data = await apiClient.request(`/migration/replacements/${encodeURIComponent(id)}/rollback-preview`, {
        method: 'POST'
      });
      return data.replacement;
    },
    async commitRollback(id, confirmation) {
      const data = await apiClient.request(`/migration/replacements/${encodeURIComponent(id)}/rollback`, {
        method: 'POST',
        body: { confirmation }
      });
      return data.replacement;
    }
  };
}
