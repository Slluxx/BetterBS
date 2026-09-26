import { defineStore } from 'pinia'
import { BASE, fetchText, fetchDom, scrape } from '@/utils/scraper.js'
import * as extract from '@/utils/extractors.js'
import { useFavoritesStore } from './favorites'

const COVER_CONCURRENCY = 3

export const useSiteStore = defineStore('site', {
    state: () => ({
        home: null,
        show: null,
        episodes: {}, // `${slug}|${season}|${language}` -> episode list
        episodeLoading: {}, // same keys -> bool
        episodeError: {}, // same keys -> error message
        // `${slug}|${season}` -> the languages THAT season offers. Kept per
        // season because a show can gain a dub later (its season 1 may list
        // only one language while a later season lists several).
        seasonLanguages: {},
        // `${slug}|${season}` -> the language the site defaults to for it.
        seasonDefault: {},
        // `${slug}|${season}|${language}` -> the language actually served. The
        // site answers a language a season doesn't have with that season's
        // default instead of failing, so the requested code can't be trusted.
        episodeLanguage: {},
        allShows: null,
        securityToken: null,
        covers: {}, // slug -> cover image URL
        showIds: {}, // slug -> numeric show id (from the cover URL)
        loading: false,
        error: null,
    }),

    actions: {
        async loadHome({ force = false } = {}) {
            if (this.home && !force) return this.home

            this.loading = true
            this.error = null
            try {
                const dom = await fetchDom(`${BASE}/`, { force })
                this.home = extract.home(dom)
                this.securityToken ||= extract.securityToken(dom)
                return this.home
            } catch (e) {
                this.error = e?.message || String(e)
                throw e
            } finally {
                this.loading = false
            }
        },

        async loadShow(slug, { force = false } = {}) {
            if (this.show?.slug === slug && !force) return this.show

            this.loading = true
            this.error = null
            try {
                const dom = await fetchDom(`${BASE}/serie/${encodeURIComponent(slug)}`, { force })
                this.show = { slug, ...extract.show(dom) }
                if (this.show.id) this.showIds[slug] = this.show.id
                this.securityToken ||= extract.securityToken(dom)
                return this.show
            } catch (e) {
                this.error = e?.message || String(e)
                throw e
            } finally {
                this.loading = false
            }
        },

        // Asks the site which language a season defaults to. A season URL
        // WITHOUT a language segment resolves to the site's own choice, which
        // is the only way to learn it (every other route has to name a
        // language). Returns { languages, default: language } and caches the
        // default language's episodes under their real key, so adopting that
        // language afterwards costs no extra request.
        async loadSeason({ slug, season }, { force = false } = {}) {
            const skey = `${slug}|${season}`
            const url = `${BASE}/serie/${encodeURIComponent(slug)}/${season}`
            const dom = await fetchDom(url, { force })
            const { languages, selected } = extract.seasonLanguages(dom)
            if (languages.length) this.seasonLanguages[skey] = languages
            this.seasonDefault[skey] = selected
            if (selected) {
                const key = `${slug}|${season}|${selected}`
                this.episodeLanguage[key] = selected
                this.episodes[key] = extract.episodes(dom)
            }
            return { languages, default: selected }
        },

        async loadEpisodes({ slug, season, language }, { force = false } = {}) {
            const key = `${slug}|${season}|${language}`
            if (this.episodes[key] && !force) return this.episodes[key]

            this.episodeLoading[key] = true
            this.episodeError[key] = ''
            try {
                const url = `${BASE}/serie/${encodeURIComponent(slug)}/${season}/${encodeURIComponent(language)}`
                // One fetch yields both the episode table and the season's real
                // language list, which the overview page does not carry.
                const dom = await fetchDom(url, { force })
                const list = extract.episodes(dom)
                const { languages, selected } = extract.seasonLanguages(dom)
                if (languages.length) this.seasonLanguages[`${slug}|${season}`] = languages
                this.episodeLanguage[key] = selected || language
                this.episodes[key] = list
                return list
            } catch (e) {
                this.episodeError[key] = e?.message || String(e)
                throw e
            } finally {
                this.episodeLoading[key] = false
            }
        },

        // The languages a given season actually offers. Falls back to the show
        // overview's list until that season's page has been fetched.
        languagesFor(slug, season, fallback = []) {
            return this.seasonLanguages[`${slug}|${season}`] ?? fallback
        },

        // The language the site defaults to for a season, once loadSeason has
        // asked it. Empty string until then.
        defaultFor(slug, season) {
            return this.seasonDefault[`${slug}|${season}`] ?? ''
        },

        // The language the site actually served for a request. Differs from the
        // requested one when the season didn't have it.
        servedLanguage(slug, season, language) {
            return this.episodeLanguage[`${slug}|${season}|${language}`] ?? language
        },

        async loadAllShows({ force = false } = {}) {
            if (this.allShows && !force) return this.allShows

            this.allShows = await scrape(`${BASE}/serie-alphabet`, extract.allShows, { force })
            return this.allShows
        },

        // Fetches cover images for the given show slugs (e.g. homepage tiles).
        // The homepage HTML has no thumbnails, so each show page must be
        // fetched once to read its cover. Requests are concurrency-limited.
        async loadCovers(slugs, { force = false } = {}) {
            const missing = [...new Set((slugs || []).filter(Boolean))].filter(s => force || !this.covers[s])
            if (!missing.length) return this.covers

            for (let i = 0; i < missing.length; i += COVER_CONCURRENCY) {
                const batch = missing.slice(i, i + COVER_CONCURRENCY)
                await Promise.all(batch.map(async (slug) => {
                    try {
                        const url = `${BASE}/serie/${encodeURIComponent(slug)}`
                        const result = await scrape(url, extract.cover)
                        this.covers[slug] = result?.url ?? ''
                        if (result?.id) this.showIds[slug] = result.id
                    } catch {
                        this.covers[slug] = ''
                    }
                }))
            }

            return this.covers
        },

        // Re-scrapes the homepage nav to refresh the favorites carousel after a
        // login or logout (the unauthenticated page shows session/demo
        // favorites instead of the account's). Non-fatal: on failure the
        // currently-displayed favorites simply stay.
        async refreshFavorites() {
            try {
                const dom = await fetchDom(`${BASE}/`, { force: true })
                const fresh = extract.home(dom).favorites
                this.home = { ...(this.home ?? {}), favorites: fresh }
                this.securityToken ||= extract.securityToken(dom)
                await this.loadCovers(fresh.map(f => f.slug))
                // Only replace the stored list when every fresh favorite's id
                // resolved; otherwise merge so nothing is silently dropped.
                useFavoritesStore().replace(
                    fresh.map(f => this.showIds[f.slug]),
                    { complete: fresh.every(f => this.showIds[f.slug]) },
                )
            } catch {
                // ignore — keep the favorites that are already shown
            }
        },

        clearShow() {
            this.show = null
            this.episodes = {}
            this.episodeLoading = {}
            this.episodeError = {}
            this.seasonLanguages = {}
            this.seasonDefault = {}
            this.episodeLanguage = {}
        },

        // Marks/unmarks an episode as watched via the site's watch:/unwatch:
        // link (requires a session), then re-fetches the episode list.
        async toggleWatched({ slug, season, language, episode }) {
            const key = `${slug}|${season}|${language}`
            const ep = (this.episodes[key] ?? []).find(e => e.number === episode)
            if (!ep?.markHref) return false
            try {
                await fetchText(ep.markHref)
                await this.loadEpisodes({ slug, season, language }, { force: true })
                return true
            } catch {
                return false
            }
        },
    },
})
