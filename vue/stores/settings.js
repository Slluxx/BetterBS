import { defineStore } from 'pinia'
import { get, set, hydrate } from '@/utils/storage.js'

const STORAGE_KEY = 'bs_settings'

// How many shows to remember a language for. Only explicit choices are
// recorded, so this is a generous cap; it just stops a long-running install
// from growing the stored object without bound.
const MAX_SHOW_LANGUAGES = 200

// The site matches language codes case-SENSITIVELY: /serie/<slug>/1/de resolves
// and /serie/<slug>/1/DE silently falls back to the season default. Codes are
// therefore always lowercased before they are stored, read, or put in a URL —
// otherwise a code that reached the UI as a display label ("DE") becomes a
// request for a language that does not exist.
function normalizeLanguage(code) {
    return typeof code === 'string' ? code.trim().toLowerCase() : ''
}

export { normalizeLanguage }

const DEFAULTS = {
    hoster: 'Doodstream',
    autoplay: true,
    // How new-episode alerts are decided:
    //  - 'always' (default): alert for any new episode that is newer than the
    //    last saved baseline, no matter where the user is in the show.
    //  - 'caught-up': only alert when the user has already seen the latest
    //    episode, so a backlog never triggers alerts.
    notificationMode: 'always',
    // slug -> language code. There is deliberately NO global language: one
    // global silently steers every show, so watching a dub on one show would
    // change which releases get reported for all the others. A show with no
    // entry here has no recorded choice and falls back to the first language
    // the site lists for it — which is exactly what its own page opens in, so
    // the show page and the new-episode check never disagree.
    showLanguages: {},
}

// Merges stored settings over the defaults and drops the retired global
// `language`. Without that drop a leftover value would linger in state and
// keep steering shows the user never picked a language for.
function normalize(stored) {
    const { language: _retiredGlobal, ...rest } =
        (stored && typeof stored === 'object' && !Array.isArray(stored)) ? stored : {}
    const merged = { ...DEFAULTS, ...rest }
    const langs = merged.showLanguages
    merged.showLanguages = (langs && typeof langs === 'object' && !Array.isArray(langs)) ? langs : {}
    return merged
}

export const useSettingsStore = defineStore('settings', {
    state: () => normalize(get(STORAGE_KEY, {})),

    actions: {
        async hydrate() {
            Object.assign(this, normalize(await hydrate(STORAGE_KEY, {})))
        },

        set(patch) {
            Object.assign(this, patch)
            this.save()
        },

        // The language to use for a show, or '' when the user never chose one.
        showLanguage(slug) {
            return normalizeLanguage(this.showLanguages?.[slug])
        },

        // Records an explicit language choice for ONE show. Only called from
        // the show page's language picker — deliberately not from ordinary page
        // loads, so that following a link to a specific dub doesn't silently
        // rewrite the preference the user actually set.
        setShowLanguage(slug, code) {
            if (!slug || !code) return
            const lang = normalizeLanguage(code)
            if (!lang) return
            const next = { ...this.showLanguages }
            // Delete first so re-picking a language moves the key to the end of
            // the insertion order, which is what makes eviction below correct.
            delete next[slug]
            next[slug] = lang
            const keys = Object.keys(next)
            for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_SHOW_LANGUAGES))) {
                delete next[stale]
            }
            this.showLanguages = next
            this.save()
        },

        save() {
            set(STORAGE_KEY, {
                hoster: this.hoster,
                autoplay: this.autoplay,
                notificationMode: this.notificationMode,
                showLanguages: this.showLanguages ?? {},
            })
        },
    },
})
