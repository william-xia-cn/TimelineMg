/**
 * TimeWhere appearance preferences.
 * Applies stable local background/avatar assets from persisted settings.
 */

const TimeWhereAppearance = {
    SETTINGS_BACKGROUND_KEY: 'appearance_background',
    SETTINGS_AVATAR_KEY: 'appearance_avatar',
    DEFAULT_BACKGROUND: 'calm',
    DEFAULT_AVATAR: 'default',
    backgrounds: {
        calm: '../../shared/images/bg-calm.jpg',
        focus: '../../shared/images/bg-focus.jpg',
        morning: '../../shared/images/bg-morning.jpg',
        evening: '../../shared/images/bg-evening.jpg'
    },
    avatars: {
        default: '../../shared/images/avatar-default.png',
        student: '../../shared/images/avatar-student.png',
        school: '../../shared/images/avatar-school.png',
        focus: '../../shared/images/avatar-focus.png'
    },

    getAssetPath(kind, key) {
        const map = kind === 'avatar' ? this.avatars : this.backgrounds;
        const fallback = kind === 'avatar' ? this.DEFAULT_AVATAR : this.DEFAULT_BACKGROUND;
        return map[key] || map[fallback];
    },

    async loadSettings() {
        if (typeof TimeWhereDB === 'undefined') {
            return {
                background: this.DEFAULT_BACKGROUND,
                avatar: this.DEFAULT_AVATAR
            };
        }
        const [background, avatar] = await Promise.all([
            TimeWhereDB.getSetting(this.SETTINGS_BACKGROUND_KEY),
            TimeWhereDB.getSetting(this.SETTINGS_AVATAR_KEY)
        ]);
        return {
            background: this.backgrounds[background] ? background : this.DEFAULT_BACKGROUND,
            avatar: this.avatars[avatar] ? avatar : this.DEFAULT_AVATAR
        };
    },

    async apply() {
        const settings = await this.loadSettings();
        this.applyValues(settings);
        return settings;
    },

    applyValues({ background, avatar }) {
        const bgPath = this.getAssetPath('background', background);
        document.documentElement.style.setProperty('--timewhere-bg-image', `url('${bgPath}')`);
        document.body.style.backgroundImage = `url('${bgPath}')`;

        const avatarPath = this.getAssetPath('avatar', avatar);
        document.querySelectorAll('img.user-avatar').forEach(img => {
            img.src = avatarPath;
        });
    },

    async save({ background, avatar }) {
        if (typeof TimeWhereDB === 'undefined') return;
        const safeBackground = this.backgrounds[background] ? background : this.DEFAULT_BACKGROUND;
        const safeAvatar = this.avatars[avatar] ? avatar : this.DEFAULT_AVATAR;
        await TimeWhereDB.setSetting(this.SETTINGS_BACKGROUND_KEY, safeBackground);
        await TimeWhereDB.setSetting(this.SETTINGS_AVATAR_KEY, safeAvatar);
        this.applyValues({ background: safeBackground, avatar: safeAvatar });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    TimeWhereAppearance.apply().catch(error => {
        console.warn('[Appearance] apply failed:', error.message || error);
    });
});
