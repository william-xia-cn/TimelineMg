/**
 * TimeWhere Sync Engine - local-first MVP stub.
 *
 * Google Sync is outside Internal MVP acceptance scope. This object keeps
 * older callers from failing while making cloud sync explicitly unavailable.
 */

const SyncEngine = {
    isInitialized: false,

    init: async function() {
        this.isInitialized = true;
        return this;
    },

    syncToGoogle: async function() {
        return { success: false, reason: 'out_of_scope_for_mvp' };
    },

    importFromGoogle: async function() {
        return { success: false, reason: 'out_of_scope_for_mvp' };
    },

    signOut: async function() {
        if (typeof TimeWhereDB !== 'undefined') {
            await TimeWhereDB.setSetting('access_token', null);
            await TimeWhereDB.setSetting('refresh_token', null);
            await TimeWhereDB.setSetting('google_connected', false);
            await TimeWhereDB.setSetting('google_email', null);
        }
        return { success: true };
    }
};

window.SyncEngine = SyncEngine;
