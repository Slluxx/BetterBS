import { defineStore } from 'pinia'
import { useSiteStore } from './site'
import { get, set, hydrate } from '@/utils/storage.js'

// The favorites list is managed by the site through POST /ajax/edit-seriesnav.php.
// That endpoint always receives the FULL list of favorite ids (series[]=…),
// so we must keep the complete list around to add/remove a single show. The
// ids are read from each show's cover image URL (…/cover/5254.jpg -> 5254).

const STORAGE_KEY = 'bs_favorites'

function normalize(ids) {
    return (Array.isArray(ids) ? ids : []).map(Number).filter(Number.isFinite)
}

function currentToken() {
    // Prefer the live page's meta tag (what the site's own AJAX uses), fall
    // back to a token captured from a background-fetched page.
    const live = document.querySelector('meta[name="security_token"]')?.getAttribute('content')
    return live || useSiteStore().securityToken || ''
}

export const useFavoritesStore = defineStore('favorites', {
    state: () => ({ ids: normalize(get(STORAGE_KEY, {}).ids) }),

    getters: {
        contains: (state) => (id) => state.ids.includes(Number(id)),
    },

    actions: {
        async hydrate() {
            const stored = await hydrate(STORAGE_KEY, {})
            this.ids = normalize(stored.ids)
        },

        save() {
            set(STORAGE_KEY, { ids: this.ids })
        },

        // Keep the stored list in sync with the favorites the site currently
        // serves in the nav. `complete` must be true only when EVERY nav
        // favorite's show id could be resolved — only then is the nav the full
        // truth and stale entries can be dropped. Otherwise we merge, because
        // dropping ids we simply couldn't look up would silently remove a
        // show from the server's list on the next toggle.
        sync(ids, { complete = false } = {}) {
            const added = normalize(ids)
            if (complete) {
                if (added.length !== this.ids.length || added.some((id, i) => id !== this.ids[i])) {
                    this.ids = added
                    this.save()
                }
                return
            }
            const merged = [...new Set([...this.ids, ...added])]
            if (merged.length !== this.ids.length) {
                this.ids = merged
                this.save()
            }
        },

        // Replace the whole list. Used after a login/logout when the nav
        // switched between guest and account favorites. Same completeness rule
        // as sync(): never drop unresolved entries.
        replace(ids, { complete = false } = {}) {
            if (!complete) return
            const next = normalize(ids)
            if (next.length !== this.ids.length || next.some((id, i) => id !== this.ids[i])) {
                this.ids = next
                this.save()
            }
        },

        // Add or remove `id` by posting the whole list, then persist the new
        // list only if the request succeeded.
        async toggle(id, favorite) {
            id = Number(id)
            if (!Number.isFinite(id) || id <= 0) {
                return { ok: false, error: 'Unbekannte Serien-ID' }
            }

            const next = favorite
                ? [...new Set([...this.ids, id])]
                : this.ids.filter(x => x !== id)

            const body = new URLSearchParams({ token: currentToken() })
            for (const i of next) body.append('series[]', String(i))

            try {
                const res = await fetch(`${location.origin}/ajax/edit-seriesnav.php`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body,
                })
                if (!res.ok) {
                    return { ok: false, error: `Server-Fehler (${res.status})` }
                }
                // A not-logged-in request is redirected to the login page, so
                // don't treat that as success.
                if (res.redirected) {
                    return { ok: false, error: 'Nicht angemeldet — Favoriten konnten nicht gespeichert werden' }
                }
                const contentType = res.headers.get('content-type') || ''
                if (contentType.includes('text/html')) {
                    return { ok: false, error: 'Favoriten konnten nicht gespeichert werden' }
                }
                this.ids = next
                this.save()
                return { ok: true }
            } catch (e) {
                return { ok: false, error: e?.message || 'Anfrage fehlgeschlagen' }
            }
        },
    },
})
