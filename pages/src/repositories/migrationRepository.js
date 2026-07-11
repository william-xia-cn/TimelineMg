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
    }
  };
}
