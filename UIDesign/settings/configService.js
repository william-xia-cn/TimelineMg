/**
 * configService.js (Mock Implementation - Vanilla JS)
 */

class ConfigService {
    constructor() {
        this.config = this._loadFromStorage() || this._getDefaultConfig();
    }

    _getDefaultConfig() {
        return {
            scheduler: {
                arrange_trigger: 'manual',
                daily_interval_minutes: 30,
                heal_time: "23:00",
                defensive_threshold_hours: 24,
            },
            containers: {
                learning: { enabled: true, start_time: "18:30", end_time: "21:30", repeat: 'weekday' },
                free: { enabled: true, start_time: "21:30", end_time: "23:00", repeat: 'daily' },
                bedtime: { enabled: true, start_time: "23:30", end_time: "07:30", repeat: 'daily' },
            },
            reminders: {
                enabled: true,
                before_deadline_minutes: 15,
            },
            user: {
                week_starts_on: 1,
                tomato_duration: 25,
                theme: 'light',
                notifications_enabled: true,
            },
            version: "1.0.0",
            initialized_at: null,
            updated_at: new Date().toISOString(),
        };
    }

    _loadFromStorage() {
        try {
            const data = localStorage.getItem('timeline_config');
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error('Failed to load config:', e);
            return null;
        }
    }

    getConfig() {
        return { ...this.config };
    }

    updateConfig(updates) {
        this.config = { ...this.config, ...updates, updated_at: new Date().toISOString() };
        localStorage.setItem('timeline_config', JSON.stringify(this.config));
        console.log('Config updated:', this.config);
    }

    isInitialized() {
        return this.config.initialized_at !== null;
    }
}

export const configService = new ConfigService();
