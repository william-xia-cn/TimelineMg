export function createLegacyUiAdapter({ taskRepository, calendarRepository, structureRepository, settingsRepository }) {
  return {
    tasks: {
      list: options => taskRepository.listTasks(options),
      create: payload => taskRepository.createTask(payload),
      update: (id, patch) => taskRepository.updateTask(id, patch),
      delete: id => taskRepository.deleteTask(id),
      complete: task => taskRepository.updateTask(task.id, { progress: 'completed' }),
      reopen: task => taskRepository.updateTask(task.id, { progress: 'not_started', completed_at: null }),
      cached: () => taskRepository.getCachedTasks()
    },
    calendar: {
      list: options => calendarRepository.listEvents(options),
      create: payload => calendarRepository.createEvent(payload),
      update: (id, patch) => calendarRepository.updateEvent(id, patch),
      delete: id => calendarRepository.deleteEvent(id),
      cached: () => calendarRepository.getCachedEvents()
    },
    structure: {
      list: options => structureRepository.listStructure(options),
      cached: () => structureRepository.getCachedStructure()
    },
    settings: {
      get: () => settingsRepository.getSettings(),
      update: patch => settingsRepository.updateSettings(patch),
      cached: () => settingsRepository.getCachedSettings()
    }
  };
}
