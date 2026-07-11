const CALENDAR_CACHE_KEY = 'timewhere.web.calendar.cache.v1';

export class OfflineCalendarWriteBlockedError extends Error {
  constructor(message = 'Editing calendar events requires a network connection') {
    super(message);
    this.code = 'offline_write_blocked';
  }
}

function canUseStorage(storage) {
  return Boolean(storage?.getItem && storage?.setItem && storage?.removeItem);
}

function readCachedEvents(storage) {
  if (!canUseStorage(storage)) return [];
  try {
    const payload = JSON.parse(storage.getItem(CALENDAR_CACHE_KEY) || 'null');
    return Array.isArray(payload?.events) ? payload.events : [];
  } catch {
    return [];
  }
}

function writeCachedEvents(storage, events) {
  if (!canUseStorage(storage)) return;
  storage.setItem(CALENDAR_CACHE_KEY, JSON.stringify({
    schema: 'timewhere-calendar-cache-v1',
    cached_at: new Date().toISOString(),
    events: Array.isArray(events) ? events : []
  }));
}

function assertOnline(isOnline) {
  if (!isOnline()) throw new OfflineCalendarWriteBlockedError('offline_write_blocked: reconnect before editing current calendar data.');
}

function mergeEventIntoCache(storage, event) {
  if (!event?.id) return;
  const events = readCachedEvents(storage);
  const index = events.findIndex(item => item.id === event.id);
  if (index >= 0) events[index] = event;
  else events.unshift(event);
  writeCachedEvents(storage, events);
}

function removeEventFromCache(storage, id) {
  writeCachedEvents(storage, readCachedEvents(storage).filter(event => event.id !== id));
}

export function createCalendarRepository(apiClient, { storage = window.localStorage, isOnline = () => navigator.onLine } = {}) {
  return {
    getCachedEvents() {
      return readCachedEvents(storage);
    },
    async listEvents({ dateFrom = '', dateTo = '', search = '' } = {}) {
      if (!isOnline()) return readCachedEvents(storage);
      const params = new URLSearchParams();
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (search) params.set('search', search);
      const suffix = params.toString() ? `?${params.toString()}` : '';
      const data = await apiClient.request(`/calendar/events${suffix}`, { method: 'GET' });
      const events = data.events || [];
      writeCachedEvents(storage, events);
      return events;
    },
    async createEvent(input) {
      assertOnline(isOnline);
      const data = await apiClient.request('/calendar/events', { method: 'POST', body: input });
      mergeEventIntoCache(storage, data.event);
      return data.event;
    },
    async updateEvent(id, patch) {
      assertOnline(isOnline);
      const data = await apiClient.request(`/calendar/events/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch });
      mergeEventIntoCache(storage, data.event);
      return data.event;
    },
    async deleteEvent(id) {
      assertOnline(isOnline);
      const result = await apiClient.request(`/calendar/events/${encodeURIComponent(id)}`, { method: 'DELETE' });
      removeEventFromCache(storage, id);
      return result;
    }
  };
}
