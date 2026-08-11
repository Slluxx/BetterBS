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

        async loadEpisodes({ slug, season, language }, { force = false } = {}) {
            const key = `${slug}|${season}|${language}`
            if (this.episodes[key] && !force) return this.episodes[key]

            this.episodeLoading[key] = true
            this.episodeError[key] = ''
            try {
                const url = `${BASE}/serie/${encodeURIComponent(slug)}/${season}/${encodeURIComponent(language)}`
                const list = await scrape(url, extract.episodes, { force })
                this.episodes[key] = list
                return list
            } catch (e) {
                this.episodeError[key] = e?.message || String(e)
                throw e
            } finally {
                this.episodeLoading[key] = false
            }
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
