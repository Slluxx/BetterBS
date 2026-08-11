import { defineStore } from 'pinia'
import { get, set, hydrate } from '@/utils/storage.js'
import { BASE, scrape } from '@/utils/scraper.js'
import * as extract from '@/utils/extractors.js'
import { useSiteStore } from './site'
import { useSettingsStore } from './settings'
import { useHistoryStore } from './history'

const STORAGE_KEY = 'bs_new_episodes'
// Don't re-scrape a show more often than this.
const RECHECK_MS = 15 * 60 * 1000
// How many show checks run in parallel (each check is 2 scrapes).
const CONCURRENCY = 3
const MAX_ITEMS = 50

// A (season, episode) pair collapses to a single comparable key.
function epKey(season, episode) {
    return Number(season || 0) * 10000 + Number(episode || 0)
}

// Alerts when a favorite show gets a new episode.
//
// Unlike the homepage's newest-episodes feed (a short rolling window that
// drops shows after a few days), this checks each favorite's own show page:
// the show's seasons are scraped, the newest season's episode list is fetched,
// and the result is compared against a saved baseline.
//
// The baseline respects where the user already is:
//   - the site's own watched state (`.watched` episodes),
//   - the episode they last played (history store).
// A show with no watched/played history only establishes the baseline on first
// sight (no alert), so an old backlog doesn't flood the bell.
export const useNotificationsStore = defineStore('notifications', {
    state: () => {
        const stored = get(STORAGE_KEY, {})
        return {
            shows: stored.shows ?? {}, // slug -> { season, episode, time } of newest known episode
            checkedAt: stored.checkedAt ?? {}, // slug -> timestamp of last check
            items: stored.items ?? [], // unread notifications, newest first
            loaded: false,
            checking: false,
        }
    },

    getters: {
        unread: (state) => state.items.filter(i => !i.read),
    },

    actions: {
        async hydrate() {
            if (this.loaded) return
            const stored = await hydrate(STORAGE_KEY, {})
            const data = stored && typeof stored === 'object' ? stored : {}
            this.shows = data.shows ?? {}
            this.checkedAt = data.checkedAt ?? {}
            this.items = Array.isArray(data.items) ? data.items : []
            this.loaded = true
        },

        save() {
            set(STORAGE_KEY, { shows: this.shows, checkedAt: this.checkedAt, items: this.items })
        },

        // Re-checks every favorite that is due. Driven by the favorites nav
        // (home.favorites), so it always matches what the user actually has
        // favorited. Per-show throttle avoids hammering the site on every visit.
        async checkFavorites() {
            if (this.checking) return
            const home = useSiteStore().home
            const slugs = (home?.favorites ?? []).map(f => f.slug).filter(Boolean)
            if (!slugs.length) return

            this.checking = true
            try {
                const now = Date.now()
                const due = slugs.filter(slug => now - (this.checkedAt[slug] ?? 0) >= RECHECK_MS)
                for (let i = 0; i < due.length; i += CONCURRENCY) {
                    const batch = due.slice(i, i + CONCURRENCY)
                    await Promise.all(batch.map(slug => this.checkShow(slug)))
                }
            } finally {
                this.checking = false
            }
        },

        async checkShow(slug) {
            const settings = useSettingsStore()
            const history = useHistoryStore()
            try {
                // Scrape directly (not via the site store) so the background
                // check never clobbers the currently displayed show.
                const show = await scrape(
                    `${BASE}/serie/${encodeURIComponent(slug)}`,
                    extract.show,
                    { force: true },
                )
                const seasons = show.seasons ?? []
                const maxSeason = seasons.reduce((m, s) => Math.max(m, s.number), 0)
                if (!maxSeason) return

                const langs = show.languages ?? []
                const lang = langs.some(l => l.code === settings.language)
                    ? settings.language
                    : (langs[0]?.code || 'de')

                const episodes = await scrape(
                    `${BASE}/serie/${encodeURIComponent(slug)}/${maxSeason}/${encodeURIComponent(lang)}`,
                    extract.episodes,
                    { force: true },
                )
                if (!episodes?.length) return

                const numbers = episodes.map(e => Number(e.number)).filter(Number.isFinite)
                const maxEp = Math.max(...numbers)
                const watchedMax = Math.max(
                    0,
                    ...episodes.filter(e => e.watched).map(e => Number(e.number)).filter(Number.isFinite),
                )

                // Where the user is at: the episode they last played, if any.
                const hist = history.items?.find(i => i.slug === slug)
                const histKey = hist && hist.season != null
                    ? epKey(hist.season, hist.episode)
                    : 0

                const saved = this.shows[slug]
                const savedKey = saved ? epKey(saved.season, saved.episode) : 0
                const watchedKey = watchedMax ? epKey(maxSeason, watchedMax) : 0
                const seenKey = Math.max(watchedKey, histKey)

                const candidate = epKey(maxSeason, maxEp)

                const firstSight = !saved && !watchedMax && !hist
                this.shows[slug] = { season: maxSeason, episode: maxEp, time: Date.now() }
                this.checkedAt[slug] = Date.now()

                if (firstSight) {
                    this.save()
                    return
                }

                // Which shows to alert about is user-selectable (settings):
                //  - 'always': any new episode that is newer than the last saved
                //    baseline, regardless of where the user is in the show.
                //  - 'caught-up': only when the user has already seen the
                //    previous latest episode, so a backlog never alerts.
                const mode = settings.notificationMode
                const alerting = mode === 'always'
                    ? candidate > savedKey
                    : seenKey >= savedKey && candidate > seenKey

                if (alerting) {
                    this.items.unshift({
                        slug,
                        title: show.title,
                        season: maxSeason,
                        episode: maxEp,
                        language: lang,
                        href: `${BASE}/serie/${encodeURIComponent(slug)}/${maxSeason}/${encodeURIComponent(lang)}`,
                        time: Date.now(),
                        read: false,
                    })
                    if (this.items.length > MAX_ITEMS) this.items = this.items.slice(0, MAX_ITEMS)
                }

                // Drop stale alerts: if the user has since reached the notified
                // episode (the site's watched state or their play history), the
                // notification is obsolete. The saved baseline is our own
                // bookkeeping, so it must NOT count as "reached" here.
                if (seenKey) {
                    this.items = this.items.filter(
                        i => i.slug !== slug || epKey(i.season, i.episode) > seenKey,
                    )
                }
                this.save()
            } catch {
                // transient / anti-bot — keep the old state, retry next check
            }
        },

        // The user has manually opened (season, episode) of a show — e.g. via
        // search, the new-episodes carousel, or normal browsing. Any alert at
        // or below that episode is obsolete; drop it instantly instead of
        // waiting for the next scheduled check.
        markReached(slug, season, episode) {
            const key = epKey(season, episode)
            const before = this.items.length
            this.items = this.items.filter(
                i => i.slug !== slug || epKey(i.season, i.episode) > key,
            )
            if (this.items.length !== before) this.save()
        },

        // Removes a single alert (the "×" on its banner entry) without touching
        // the others.
        remove(item) {
            const before = this.items.length
            this.items = this.items.filter(
                i => !(i.time === item.time && i.slug === item.slug
                    && i.season === item.season && i.episode === item.episode),
            )
            if (this.items.length !== before) this.save()
        },

        markRead(item) {
            if (!item) return
            item.read = true
            this.save()
        },

        markAllRead() {
            this.items.forEach(i => (i.read = true))
            this.save()
        },

        clear() {
            this.items = []
            this.save()
        },
    },
})
