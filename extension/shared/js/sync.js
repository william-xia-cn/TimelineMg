/**
 * TimeWhere Sync Engine - Google Tasks & Calendar API
 * 版本: v2.0
 * 日期: 2026-04-02
 */

const SyncEngine = {
    googleAuth: null,
    accessToken: null,
    isInitialized: false,

    CLIENT_ID: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
    SCOPES: 'https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/calendar',

    setClientId: function(clientId) {
        this.CLIENT_ID = clientId;
    },

    init: function() {
        if (this.isInitialized) return Promise.resolve();
        
        return this.loadSettings().then(settings => {
            if (settings.access_token) {
                this.accessToken = settings.access_token;
                this.isInitialized = true;
            }
            return this;
        });
    },

    loadSettings: async function() {
        if (typeof TimeWhereDB !== 'undefined') {
            return await TimeWhereDB.getSettings();
        }
        return {};
    },

    signIn: function() {
        return new Promise((resolve, reject) => {
            chrome.identity.launchWebAuthFlow({
                url: this.getAuthUrl(),
                interactive: true
            }, async (redirectUrl) => {
                if (chrome.runtime.lastError || !redirectUrl) {
                    reject(chrome.runtime.lastError);
                    return;
                }

                try {
                    const token = await this.exchangeCodeForToken(redirectUrl);
                    this.accessToken = token.access_token;
                    this.isInitialized = true;

                    if (typeof TimeWhereDB !== 'undefined') {
                        await TimeWhereDB.setSetting('access_token', token.access_token);
                        await TimeWhereDB.setSetting('refresh_token', token.refresh_token);
                        await TimeWhereDB.setSetting('google_connected', true);
                    }

                    resolve(token);
                } catch (e) {
                    reject(e);
                }
            });
        });
    },

    getAuthUrl: function() {
        const baseUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
        const params = new URLSearchParams({
            client_id: this.CLIENT_ID,
            redirect_uri: chrome.identity.getRedirectURL(),
            response_type: 'code',
            scope: this.SCOPES,
            access_type: 'refresh',
            prompt: 'consent'
        });
        return `${baseUrl}?${params.toString()}`;
    },

    exchangeCodeForToken: async function(redirectUrl) {
        const url = new URL(redirectUrl);
        const code = url.searchParams.get('code');
        
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code: code,
                client_id: this.CLIENT_ID,
                redirect_uri: chrome.identity.getRedirectURL(),
                grant_type: 'authorization_code'
            })
        });

        if (!response.ok) {
            throw new Error('Token exchange failed');
        }

        return await response.json();
    },

    refreshAccessToken: async function() {
        const settings = await this.loadSettings();
        const refreshToken = settings.refresh_token;

        if (!refreshToken) {
            throw new Error('No refresh token available');
        }

        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: this.CLIENT_ID,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            })
        });

        if (!response.ok) {
            throw new Error('Token refresh failed');
        }

        const token = await response.json();
        this.accessToken = token.access_token;

        if (typeof TimeWhereDB !== 'undefined') {
            await TimeWhereDB.setSetting('access_token', token.access_token);
        }

        return token;
    },

    apiCall: async function(endpoint, options = {}) {
        if (!this.accessToken) {
            await this.init();
        }

        try {
            const response = await fetch(`https://www.googleapis.com${endpoint}`, {
                ...options,
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });

            if (response.status === 401) {
                await this.refreshAccessToken();
                return this.apiCall(endpoint, options);
            }

            if (!response.ok) {
                throw new Error(`API call failed: ${response.status}`);
            }

            return await response.json();
        } catch (e) {
            console.error('TimeWhere Sync: API call failed', e);
            throw e;
        }
    },

    // Google Tasks Operations
    listTasks: async function(taskListId = '@default') {
        return await this.apiCall(`/tasks/v1/users/@me/lists/${taskListId}/tasks`);
    },

    createTask: async function(taskListId, task) {
        return await this.apiCall(`/tasks/v1/users/@me/lists/${taskListId}/tasks`, {
            method: 'POST',
            body: JSON.stringify(task)
        });
    },

    updateTask: async function(taskListId, taskId, task) {
        return await this.apiCall(`/tasks/v1/users/@me/lists/${taskListId}/tasks/${taskId}`, {
            method: 'PUT',
            body: JSON.stringify(task)
        });
    },

    deleteTask: async function(taskListId, taskId) {
        return await this.apiCall(`/tasks/v1/users/@me/lists/${taskListId}/tasks/${taskId}`, {
            method: 'DELETE'
        });
    },

    // Google Calendar Operations
    listEvents: async function(calendarId = 'primary', params = {}) {
        const query = new URLSearchParams(params).toString();
        return await this.apiCall(`/calendar/v3/calendars/${calendarId}/events?${query}`);
    },

    createEvent: async function(calendarId, event) {
        return await this.apiCall(`/calendar/v3/calendars/${calendarId}/events`, {
            method: 'POST',
            body: JSON.stringify(event)
        });
    },

    updateEvent: async function(calendarId, eventId, event) {
        return await this.apiCall(`/calendar/v3/calendars/${calendarId}/events/${eventId}`, {
            method: 'PATCH',
            body: JSON.stringify(event)
        });
    },

    deleteEvent: async function(calendarId, eventId) {
        return await this.apiCall(`/calendar/v3/calendars/${calendarId}/events/${eventId}`, {
            method: 'DELETE'
        });
    },

    // Sync Logic
    syncToGoogle: async function() {
        if (!this.isInitialized) {
            await this.init();
        }

        if (!this.accessToken) {
            console.log('TimeWhere: Not signed in');
            return { success: false, reason: 'not_signed_in' };
        }

        try {
            const pendingLogs = await TimeWhereDB.getPendingSyncLogs();
            let synced = 0;
            let failed = 0;

            for (const log of pendingLogs) {
                try {
                    if (log.type === 'task') {
                        await this.syncTaskLog(log);
                    } else if (log.type === 'container') {
                        await this.syncContainerLog(log);
                    }

                    await TimeWhereDB.clearSyncLog(log.id);
                    synced++;
                } catch (e) {
                    console.error('TimeWhere: Failed to sync log', log.id, e);
                    failed++;
                }
            }

            await TimeWhereDB.setSetting('last_sync', new Date().toISOString());

            return { success: true, synced, failed };
        } catch (e) {
            console.error('TimeWhere: Sync failed', e);
            return { success: false, error: e.message };
        }
    },

    syncTaskLog: async function(log) {
        const data = JSON.parse(log.data);
        
        if (log.action === 'create') {
            const task = {
                title: data.title,
                notes: data.description || '',
                due: data.deadline ? `${data.deadline}T12:00:00Z` : null,
                status: data.status === 'completed' ? 'completed' : 'needsAction'
            };
            const result = await this.createTask('@default', task);
            await TimeWhereDB.updateTask(data.id, { google_task_id: result.id });
        } else if (log.action === 'update') {
            if (data.google_task_id) {
                const task = {
                    title: data.title,
                    notes: data.description || '',
                    status: data.status === 'completed' ? 'completed' : 'needsAction'
                };
                await this.updateTask('@default', data.google_task_id, task);
            }
        } else if (log.action === 'delete') {
            if (data.google_task_id) {
                await this.deleteTask('@default', data.google_task_id);
            }
        }
    },

    syncContainerLog: async function(log) {
        const data = JSON.parse(log.data);
        
        if (log.action === 'create' || log.action === 'update') {
            const event = {
                summary: data.name,
                start: { dateTime: this.combineDateTime('2026-01-01', data.time_start) },
                end: { dateTime: this.combineDateTime('2026-01-01', data.time_end) }
            };
            
            if (data.google_calendar_event_id) {
                await this.updateEvent('primary', data.google_calendar_event_id, event);
            } else {
                const result = await this.createEvent('primary', event);
                await TimeWhereDB.updateContainer(data.id, { google_calendar_event_id: result.id });
            }
        } else if (log.action === 'delete') {
            if (data.google_calendar_event_id) {
                await this.deleteEvent('primary', data.google_calendar_event_id);
            }
        }
    },

    combineDateTime: function(date, time) {
        return `${date}T${time}:00+08:00`;
    },

    importFromGoogle: async function() {
        if (!this.isInitialized) {
            await this.init();
        }

        if (!this.accessToken) {
            return { success: false, reason: 'not_signed_in' };
        }

        try {
            const tasksResult = await this.listTasks();
            const tasks = tasksResult.items || [];
            
            let imported = 0;
            for (const task of tasks) {
                if (!task.deleted && task.status === 'needsAction') {
                    await TimeWhereDB.addTask({
                        title: task.title,
                        description: task.notes || '',
                        deadline: task.due ? task.due.split('T')[0] : null,
                        bucket: 'other',
                        priority: 'P3',
                        google_task_id: task.id
                    });
                    imported++;
                }
            }

            return { success: true, imported };
        } catch (e) {
            console.error('TimeWhere: Import failed', e);
            return { success: false, error: e.message };
        }
    },

    signOut: async function() {
        this.accessToken = null;
        this.isInitialized = false;

        if (typeof TimeWhereDB !== 'undefined') {
            await TimeWhereDB.setSetting('access_token', null);
            await TimeWhereDB.setSetting('refresh_token', null);
            await TimeWhereDB.setSetting('google_connected', false);
        }

        return { success: true };
    }
};

window.SyncEngine = SyncEngine;