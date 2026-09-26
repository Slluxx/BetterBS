import { defineStore } from 'pinia'
import { get, set, hydrate } from '@/utils/storage.js'
import { BASE, scrape, fetchDom } from '@/utils/scraper.js'
import * as extract from '@/utils/extractors.js'
import { useSiteStore } from './site'
import { useSettingsStore, normalizeLanguage } from './settings'
import { useHistoryStore } from './history'
import { useSessionStore } from './session'
import { log } from '@/utils/log.js'

// Bumped from bs_new_episodes. The previous schema stored a single "newest known
// episode" baseline per show and conflated three different things: what the site
// has, what the user has watched, and what has already been reported. Data in
// that shape cannot be migrated reliably — a baseline written by an earlier
// check that counted table rows instead of playable episodes reads as "the user
// is up to date" and silently suppresses every future alert for that dub. The
// alert state is a cache, so starting clean is both safer and self-healing: the
// user's position is re-derived from the site's watched state and their history.
const STORAGE_KEY = 'bs_new_episodes_v2'
// Don't re-scrape a show more often than this, within one page load.
const RECHECK_MS = 15 * 60 * 1000
// How many show checks run in parallel.
const CONCURRENCY = 3
const MAX_ITEMS = 100

// A (season, episode) pair collapses to a single comparable key, so "newer than"
// is one integer comparison and works across season boundaries.
function epKey(season, episode) {
    return Number(season || 0) * 10000 + Number(episode || 0)
}
function keySeason(key) {
    return Math.floor(Number(key) / 10000)
}
function keyEpisode(key) {
    return Number(key) % 10000
}

// Alerts when a favorite show has episodes the user has not seen yet.
//
// The model is deliberately "unwatched and newer than where you are", not "the
// newest episode number moved":
//
//   seen[slug]      the highest (season, episode) the site reports as WATCHED,
//                   combined with the episode the user last played. This is the
//                   reference point, and it only ever advances on evidence that
//                   an episode was seen — never because a page was opened.
//   reached[slug]   episodes the user opened. Suppresses exactly those, and
//                   nothing else, until the site's watched markers catch up.
//   dismissed[slug] episodes the user explicitly closed. Remembered so a
//                   dismissal is not re-raised on the next page load, and
//                   deliberately NOT folded into `seen`: closing a notification
//                   says "I know", not "I watched it".
//   items[]         one alert per unwatched episode newer than `seen`, so a dub
//                   that is three episodes behind produces three alerts instead
//                   of only the newest.
//
// Because the reference point is a (season, episode) pair and not a per-season
// number, a season transition needs no special case: the last episode of season
// x and the first of season y are simply the two lowest unwatched keys above it.
//
// Which language is checked is per show (settings.showLanguages) — never global,
// because one global would let browsing a dub on one show change which releases
// are reported for all the others.
//
// Availability is per EPISODE, not per season. The site lists a row for every
// episode of a season even when the dub hasn't released it, so only rows that
// are actually playable count. Yani Neko S1 has 1-9 in `de` but 1-12 in `des`:
// a `de` viewer must see nothing until German catches up, and must then be told
// about episode 10. Counting rows instead of episodes is what produced alerts for
// episodes a dub never had.
// Episodes the user has opened, per show: "season|episode" -> timestamp. Kept
// separate from both `seen` (how far the user has actually watched) and
// `dismissed` (episodes they told us to stop mentioning), because all three
// suppress a future alert for different reasons.
const REACHED_MAX = 60

// An entry is redundant once the position is at or past it — the position
// already suppresses that episode — so it is dropped. Without this the map would
// grow for the life of the install.
function pruneReached(map, position) {
    const out = {}
    for (const [k, v] of Object.entries(map)) {
        const [s, e] = k.split('|').map(Number)
        if (epKey(s || 0, e || 0) > position) out[k] = v
    }
    const entries = Object.entries(out).sort((a, b) => b[1] - a[1])
    return Object.fromEntries(entries.slice(0, REACHED_MAX))
}

export const useNotificationsStore = defineStore('notifications', {
    state: () => {
        const stored = get(STORAGE_KEY, {})
        return {
            seen: stored.seen ?? {}, // slug -> { season, episode, language, time }
            reached: stored.reached ?? {}, // slug -> { "season|episode": time }
            dismissed: stored.dismissed ?? {}, // slug -> { "season|episode": true }
            checkedAt: stored.checkedAt ?? {}, // slug -> timestamp of last check
            items: stored.items ?? [], // open alerts, newest first
            loaded: false,
            checking: false,
            // Whether this page load has already run a check. Deliberately NOT
            // persisted: the first check of a freshly opened page always
            // refetches, while later checks in the same page load still respect
            // the per-show throttle.
            checkedOnLoad: false,
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
            this.seen = data.seen ?? {}
            this.reached = data.reached ?? {}
            this.dismissed = data.dismissed ?? {}
            this.checkedAt = data.checkedAt ?? {}
            this.items = Array.isArray(data.items) ? data.items : []
            this.loaded = true
            this.exposeDevTools()
        },

        save() {
            set(STORAGE_KEY, {
                seen: this.seen,
                reached: this.reached,
                dismissed: this.dismissed,
                checkedAt: this.checkedAt,
                items: this.items,
            })
        },

        // Re-checks the favorites that are due, plus any show we still hold an
        // alert for — those are re-validated whether or not the show is still
        // favorited, because an alert nothing ever looks at again is an alert
        // that can stay wrong forever.
        async checkFavorites() {
            if (this.checking) return
            // A logged-out visitor's nav holds the site's pre-populated demo
            // favourites, not a list the user picked, so alerts derived from them
            // are noise — and the user cannot even have favourites of their own
            // (saving one bounces to the login page). Drop what we are holding and
            // forget the per-show throttle, so that signing back in re-checks at
            // once rather than waiting out the 15 minutes. `seen` is deliberately
            // kept: that is the user's own watch position, and it is what stops
            // already-watched episodes from alerting again.
            if (!useSessionStore().loggedIn) {
                if (this.items.length || Object.keys(this.checkedAt).length) {
                    log('[notifications] signed out, dropping alerts')
                    this.items = []
                    this.checkedAt = {}
                    this.save()
                }
                return
            }
            const home = useSiteStore().home
            const slugs = (home?.favorites ?? []).map(f => f.slug).filter(Boolean)
            const held = new Set(this.items.map(i => i.slug))
            if (!slugs.length && !held.size) return

            this.checking = true
            try {
                // The first check of a freshly opened page ALWAYS refetches. The
                // throttle is a floor for repeated checks inside one page load,
                // not permission to greet a new page with a stale episode list.
                const first = !this.checkedOnLoad
                this.checkedOnLoad = true
                const now = Date.now()
                const targets = new Set([...slugs, ...held])
                const due = [...targets].filter(slug =>
                    first
                    || held.has(slug)
                    || now - (this.checkedAt[slug] ?? 0) >= RECHECK_MS)
                for (let i = 0; i < due.length; i += CONCURRENCY) {
                    const batch = due.slice(i, i + CONCURRENCY)
                    await Promise.all(batch.map(slug => this.checkShow(slug)))
                }
            } finally {
                this.checking = false
            }
        },

        // Records the attempt whether or not it worked. Without this a show the
        // site refuses to serve (or one that throws) keeps `checkedAt` at 0 and
        // is re-scraped on EVERY check for the rest of the session — a
        // permanent request source, and the most likely way to get the site to
        // start throttling. The first check of a page load bypasses the throttle
        // anyway, so a failing show still gets one fresh attempt per page load.
        async checkShow(slug) {
            try {
                await this.inspectShow(slug)
            } catch (e) {
                // transient / anti-bot — keep what we have and retry next check
                log('[notifications] check failed', slug, e?.message)
            } finally {
                this.checkedAt[slug] = Date.now()
                this.save()
            }
        },

        async inspectShow(slug) {
            const settings = useSettingsStore()
            const history = useHistoryStore()
            const show = await scrape(
                `${BASE}/serie/${encodeURIComponent(slug)}`,
                extract.show,
                { force: true },
            )
            {
                const seasonNumbers = (show.seasons ?? [])
                    .map(s => s.number).filter(n => n > 0).sort((a, b) => a - b)
                const maxSeason = seasonNumbers[seasonNumbers.length - 1] ?? 0
                if (!maxSeason) return

                const wanted = normalizeLanguage(settings.showLanguage(slug))
                const hist = history.items?.find(i => i.slug === slug)
                // "Continue watching" is a position in ONE language's episode list.
                // Once a show's dub is switched, carrying that number over would
                // suppress real alerts for the new language (English at E1 looks
                // "seen" because German was at E9). A history entry recorded
                // before languages were tracked carries no code, and is treated as
                // language-agnostic so existing data keeps behaving as before.
                const histKey = hist && hist.season != null
                    && (!hist.language || !wanted || normalizeLanguage(hist.language) === wanted)
                    ? epKey(hist.season, hist.episode) : 0
                const storedSeen = this.seen[slug]
                // A stored position only counts while the followed dub is
                // unchanged: it counts episodes of ONE language, so after a dub
                // switch it describes a different episode list. An empty `wanted`
                // means no choice was recorded, so whatever language it was saved
                // under still applies.
                const storedKey = storedSeen && (
                    !wanted || !storedSeen.language
                    || normalizeLanguage(storedSeen.language) === wanted
                )
                    ? epKey(storedSeen.season, storedSeen.episode) : 0
                // A stored position only counts while the followed dub is
                // unchanged: it counts episodes of ONE language, so after a dub
                // switch it describes a different episode list.
                const reachedBefore = Math.max(storedKey, histKey)

                // Which seasons to inspect. The newest, plus the one before it:
                // a dub is often still releasing into the previous season while
                // the next one has started, and "last episode of season x, first
                // of season y, neither seen" must be able to alert. The season
                // the user is actually in is included when it falls in that
                // window. Bounded so a long backlog can't fan out into a burst of
                // requests.
                const inspect = new Set([maxSeason])
                if (maxSeason - 1 > 0) inspect.add(maxSeason - 1)
                const reachedSeason = reachedBefore ? keySeason(reachedBefore) : 0
                if (reachedSeason && reachedSeason >= maxSeason - 1) inspect.add(reachedSeason)

                // season -> Map(episode -> watched)
                const perSeason = new Map()
                const labels = {}
                let lang = wanted
                let anySeasonCarriesDub = false

                for (const season of [...inspect].sort((a, b) => b - a)) {
                    const url = `${BASE}/serie/${encodeURIComponent(slug)}/${season}`
                        + (wanted ? `/${encodeURIComponent(wanted)}` : '')
                    const dom = await fetchDom(url, { force: true })
                    const { languages, selected } = extract.seasonLanguages(dom)
                    // The site does not fail on a language a season lacks — it
                    // serves that season's default with 200 — so the <select> is
                    // the only trustworthy answer to "does this season carry the
                    // dub we follow".
                    const carries = wanted ? languages.some(l => l.code === wanted) : true
                    if (!carries) continue
                    anySeasonCarriesDub = true
                    if (!lang) lang = selected || languages[0]?.code || 'de'
                    for (const l of languages) labels[l.code] = l.label
                    const rows = extract.episodes(dom).filter(e => !e.disabled)
                    perSeason.set(season, new Map(
                        rows.map(e => [Number(e.number), !!e.watched]),
                    ))
                }

                if (!lang) lang = wanted || labels[Object.keys(labels)[0]] || 'de'
                if (!wanted && lang) settings.setShowLanguage(slug, lang)

                if (!anySeasonCarriesDub || !perSeason.size) {
                    this.dropAlerts(slug, 'no season carries the followed dub')
                    return
                }

                // The user's position: the furthest episode actually WATCHED. The
                // stored position is only a floor — the site's own watched markers
                // are the authority, and they can move it either way.
                let position = reachedBefore
                for (const [season, rows] of perSeason) {
                    for (const [episode, watched] of rows) {
                        if (watched) position = Math.max(position, epKey(season, episode))
                    }
                }

                // Everything playable that the user has not watched and has not
                // already been dealt with.
                const dismissed = this.dismissed[slug] ?? {}
                const reachedMap = this.reached[slug] ?? {}
                const alreadyOpen = new Set(
                    this.items.filter(i => i.slug === slug)
                        .map(i => epKey(i.season, i.episode)),
                )
                const playableKeys = new Set()
                const candidates = []
                for (const [season, rows] of perSeason) {
                    for (const episode of rows.keys()) {
                        const key = epKey(season, episode)
                        playableKeys.add(key)
                        if (key <= position) continue
                        if (dismissed[`${season}|${episode}`]) continue
                        if (reachedMap[`${season}|${episode}`]) continue
                        if (alreadyOpen.has(key)) continue
                        candidates.push({ season, episode, key })
                    }
                }
                candidates.sort((a, b) => a.key - b.key)

                // Re-validate what we are holding. An alert is only true while the
                // episode is still playable in the followed dub, the user has not
                // watched it, and they have not already dealt with it. All three
                // are decidable from what we just fetched plus the stored maps.
                this.items = this.items
                    .map(i => {
                        if (i.slug !== slug) return i
                        const code = normalizeLanguage(i.language)
                        if (code === i.language) return i
                        return {
                            ...i,
                            language: code,
                            href: `${BASE}/serie/${encodeURIComponent(slug)}/${i.season}/${encodeURIComponent(code)}`,
                        }
                    })
                    .filter(i => {
                        if (i.slug !== slug) return true
                        if (normalizeLanguage(i.language) !== lang) return false
                        const key = epKey(i.season, i.episode)
                        if (!playableKeys.has(key)) return false
                        if (dismissed[`${i.season}|${i.episode}`]) return false
                        if (reachedMap[`${i.season}|${i.episode}`]) return false
                        return key > position
                    })

                // settings.notificationMode:
                //  'always'     every unwatched episode newer than where you are,
                //                so a dub three episodes ahead raises three alerts
                //  'caught-up'  only when nothing is pending except the new one —
                //                i.e. you had seen the last available episode
                const mode = settings.notificationMode
                const toAlert = mode === 'caught-up' ? candidates.slice(0, 1) : candidates

                const fresh = toAlert.map(c => ({
                    slug,
                    title: show.title,
                    season: c.season,
                    episode: c.episode,
                    language: lang,
                    // The site's own label ("Deutsch Sub"), so the banner can show
                    // the short code with the full name as a tooltip without
                    // re-scraping anything.
                    languageLabel: labels[lang] ?? '',
                    href: `${BASE}/serie/${encodeURIComponent(slug)}/${c.season}/${encodeURIComponent(lang)}`,
                    time: Date.now(),
                    read: false,
                }))
                if (fresh.length) this.items = [...fresh, ...this.items]
                if (this.items.length > MAX_ITEMS) this.items = this.items.slice(0, MAX_ITEMS)

                this.seen[slug] = {
                    season: keySeason(position),
                    episode: keyEpisode(position),
                    language: lang,
                    time: Date.now(),
                }
                // Everything at or below the position is covered by it now, so the
                // per-episode bookkeeping can shrink.
                this.reached[slug] = pruneReached(this.reached[slug] ?? {}, position)
            }
        },

        dropAlerts(slug, why) {
            const before = this.items.length
            this.items = this.items.filter(i => i.slug !== slug)
            if (this.items.length !== before) log('[notifications] dropped alerts', slug, why)
        },

        // The user opened (season, episode).
        //
        // This must retire exactly ONE alert — the one they clicked. It must not
        // treat "I opened episode 12" as "I have seen everything up to episode
        // 12": with a dub that dropped a whole season at once, clicking the
        // newest alert would otherwise wipe the entire backlog, and because the
        // position advanced with it, those episodes would never be raised again.
        //
        // The position is advanced only by real evidence that an episode was
        // watched — the site's own watched markers, read in checkShow. Here we
        // only remember that this one episode has been dealt with, so it is not
        // raised again before the site catches up.
        markReached(slug, season, episode) {
            const s = Number(season) || 0
            const e = Number(episode) || 0
            const key = `${s}|${e}`
            const before = this.items.length
            this.items = this.items.filter(
                i => !(i.slug === slug && `${i.season}|${i.episode}` === key),
            )
            const list = { ...(this.reached[slug] ?? {}) }
            list[key] = Date.now()
            // Prune against the show's real position, NOT the episode just opened:
            // pruning against the latter would immediately delete the entry.
            const stored = this.seen[slug]
            const position = epKey(stored?.season ?? 0, stored?.episode ?? 0)
            this.reached[slug] = pruneReached(list, position)
            if (this.items.length !== before) {
                log('[notifications] reached', slug, key, `${before} -> ${this.items.length} alerts`)
            }
            this.save()
        },

        // Called when the user picks a different dub for a show. Everything we
        // remember about that show describes ONE language's episode list, so it is
        // dropped rather than reinterpreted: the position would otherwise hide
        // real alerts (English at E1 looks seen because German was at E9), a
        // dismissal in the old language would mute the new one, and the throttle
        // would keep the stale answer for another 15 minutes. The rebuild then
        // derives everything from the new language's watched state.
        async languageChanged(slug) {
            if (!slug) return 0
            // Same rule as checkFavorites(): a signed-out visitor's show page is
            // reached through the demo favourites, so rebuilding here would raise
            // an alert for a show they never chose.
            if (!useSessionStore().loggedIn) return 0
            delete this.seen[slug]
            delete this.reached[slug]
            delete this.dismissed[slug]
            delete this.checkedAt[slug]
            this.items = this.items.filter(i => i.slug !== slug)
            this.save()
            await this.checkShow(slug)
            return this.items.filter(i => i.slug === slug).length
        },

        // Closes one alert without claiming the episode was watched. The episode
        // is remembered as dismissed so the next check does not raise it again;
        // it is deliberately NOT recorded in `seen`, so if the user later watches
        // it, or the alert is irrelevant, the position stays honest.
        dismiss(item) {
            if (!item) return
            const key = epKey(item.season, item.episode)
            const before = this.items.length
            this.items = this.items.filter(
                i => !(i.slug === item.slug && epKey(i.season, i.episode) === key),
            )
            const list = { ...(this.dismissed[item.slug] ?? {}) }
            list[`${item.season}|${item.episode}`] = true
            this.dismissed[item.slug] = list
            if (this.items.length !== before) log('[notifications] dismissed', item.slug, key)
            this.save()
        },

        // Un-dismisses, so the alert comes back on the next check.
        undismiss(slug, season, episode) {
            const list = { ...(this.dismissed[slug] ?? {}) }
            delete list[`${season}|${episode}`]
            this.dismissed[slug] = list
            this.save()
        },

        markRead(item) {
            if (!item) return
            item.read = true
            this.save()
        },

        markAllRead() {
            this.items.forEach(i => { i.read = true })
            this.save()
        },

        clear() {
            this.items = []
            this.save()
        },

        // Console-only helpers, for working out why an alert did or didn't fire
        // without waiting on the site's release schedule. Available as
        // `__bsAlerts` in the page console; nothing in the UI calls these.
        exposeDevTools() {
            if (typeof window === 'undefined' || window.__bsAlerts) return
            window.__bsAlerts = {
                // What the store currently believes.
                state: () => JSON.parse(JSON.stringify({
                    seen: this.seen,
                    reached: this.reached,
                    dismissed: this.dismissed,
                    items: this.items,
                })),
                // Forget everything, so the next check re-derives the position from
                // the site's watched state. `keepSeen` leaves the position alone
                // and only clears the alerts, which is the way to re-trigger the
                // alert for an episode you have already dismissed.
                reset: ({ keepSeen = false } = {}) => {
                    this.items = []
                    this.dismissed = {}
                    this.reached = {}
                    this.checkedAt = {}
                    if (!keepSeen) this.seen = {}
                    this.checkedOnLoad = false
                    this.save()
                    return 'reset; run __bsAlerts.recheck() to rebuild'
                },
                // Re-run every check now, ignoring the throttle.
                recheck: async () => {
                    this.checkedOnLoad = false
                    this.checkedAt = {}
                    await this.checkFavorites()
                    return this.items.length
                },
                // Pretend the user has reached this episode, e.g. to check that the
                // episodes after it raise exactly the alerts you expect.
                setSeen: (slug, season, episode) => {
                    this.seen[slug] = {
                        season: Number(season) || 0,
                        episode: Number(episode) || 0,
                        language: normalizeLanguage(this.seen[slug]?.language) || 'de',
                        time: Date.now(),
                    }
                    this.save()
                    return this.seen[slug]
                },
            }
        },
    },
})
