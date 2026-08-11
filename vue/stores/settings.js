import { defineStore } from 'pinia'
import { get, set, hydrate } from '@/utils/storage.js'

const STORAGE_KEY = 'bs_settings'

const DEFAULTS = {
    language: 'de',
    hoster: 'Doodstream',
    autoplay: true,
    // How new-episode alerts are decided:
    //  - 'always' (default): alert for any new episode that is newer than the
    //    last saved baseline, no matter where the user is in the show.
    //  - 'caught-up': only alert when the user has already seen the latest
    //    episode, so a backlog never triggers alerts.
    notificationMode: 'always',
}

export const useSettingsStore = defineStore('settings', {
    state: () => ({ ...DEFAULTS, ...get(STORAGE_KEY, {}) }),

    actions: {
        async hydrate() {
            const stored = await hydrate(STORAGE_KEY, {})
            Object.assign(this, { ...DEFAULTS, ...stored })
        },

        set(patch) {
            Object.assign(this, patch)
            this.save()
        },

        save() {
            set(STORAGE_KEY, {
                language: this.language,
                hoster: this.hoster,
                autoplay: this.autoplay,
                notificationMode: this.notificationMode,
            })
        },
    },
})
