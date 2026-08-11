import { defineStore } from 'pinia'
import { get, set, hydrate } from '@/utils/storage.js'

const STORAGE_KEY = 'recentlyVisited'
const MAX_ITEMS = 20

// Older builds persisted history as a plain object with numeric keys
// ({"0": item, "1": item, ...}) instead of an array. Both formats can sit in
// the two storage backends (extension storage keeps the stale object after the
// format changed), so normalize whatever comes back. Newest first.
function normalizeHistory(stored) {
    let list
    if (Array.isArray(stored)) {
        list = stored
    } else if (stored && typeof stored === 'object') {
        list = Object.values(stored)
    } else {
        list = []
    }
    return list
        .filter(i => i && typeof i === 'object' && typeof i.slug === 'string')
        .sort((a, b) => (b.time ?? 0) - (a.time ?? 0))
}

export const useHistoryStore = defineStore('history', {
    state: () => {
        const stored = get(STORAGE_KEY, [])
        return {
            items: normalizeHistory(stored).slice(0, MAX_ITEMS),
            loaded: false,
        }
    },

    actions: {
        async init() {
            if (this.loaded) return
            const stored = await hydrate(STORAGE_KEY, [])
            this.items = normalizeHistory(stored).slice(0, MAX_ITEMS)
            this.loaded = true
            // The restored value may be the stale legacy object; rewrite both
            // backends with the normalized array so it doesn't shadow new data
            // on the next load.
            if (!Array.isArray(stored)) this.save()
        },

        add(entry) {
            const ep = Number(entry.episode)
            const item = {
                slug: entry.slug,
                title: entry.title,
                cover: entry.cover ?? '',
                season: entry.season ?? null,
                // Never save a show without an episode: missing/invalid → 1.
                episode: Number.isNaN(ep) || ep < 1 ? 1 : ep,
                time: Date.now(),
            }

            const current = Array.isArray(this.items) ? this.items : []
            this.items = [item, ...current.filter(i => i?.slug !== item.slug)].slice(0, MAX_ITEMS)
            this.save()
        },

        save() {
            set(STORAGE_KEY, this.items)
        },
    },
})
