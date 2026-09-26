<template>
    <SiteLayout>
        <HeroBanner />

        <div class="max-w-screen-2xl mx-auto px-3 sm:px-6 py-6 sm:py-8">

            <div v-if="site.loading && !site.home" class="flex justify-center py-24">
                <span class="loading loading-spinner loading-lg"></span>
            </div>

            <p v-else-if="site.error && !site.home" class="text-center opacity-70 py-24">
                Inhalte konnten nicht geladen werden: {{ site.error }}
            </p>

            <div v-else class="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">
                <div class="space-y-10 min-w-0">
                    <MediaCarousel v-if="recentlyWatched.length" title="Zuletzt angesehen" :items="recentlyWatched" />
                    <MediaCarousel v-if="favorites.length" title="Favoriten" :items="favorites" />
                    <MediaCarousel title="Neueste Folgen" :items="episodes" />
                </div>
                <NewShowsList :items="shows" />
            </div>
        </div>
    </SiteLayout>
</template>

<script setup>
import { onMounted, computed } from 'vue'
import SiteLayout from '../components/SiteLayout.vue'
import HeroBanner from '../components/HeroBanner.vue'
import MediaCarousel from '../components/MediaCarousel.vue'
import NewShowsList from '../components/NewShowsList.vue'
import { useSiteStore } from '../stores/site'
import { useHistoryStore } from '../stores/history'
import { useFavoritesStore } from '../stores/favorites'
import { useSettingsStore } from '../stores/settings'

const site = useSiteStore()
const history = useHistoryStore()
const favoritesStore = useFavoritesStore()
const settings = useSettingsStore()

// A link that opens a show in a specific dub. The language is per show (see the
// settings store), so a tile never carries a "global" language — it either
// names the language chosen for that show or omits it and lets the show page
// fall back to the site's own first language. Slugs are encoded because they
// come from scraped hrefs and may contain spaces or other reserved characters.
function showLink(slug, { season, episode, lang } = {}) {
    const path = '/show/' + encodeURIComponent(slug)
    const suffix = season != null ? `/${season}` : ''
    const ep = episode != null ? `/${episode}` : ''
    const query = lang ? { lang } : undefined
    return query ? { path: `${path}${suffix}${ep}`, query } : `${path}${suffix}${ep}`
}

// Short form of a language code for the tile badges. The full label lives on the
// show page (it would need a scrape to resolve here); the code is enough to tell
// two dubs of the same show apart.
function shortLang(slug) {
    const code = settings.showLanguage(slug)
    return code ? code.toUpperCase() : ''
}

onMounted(async () => {
    history.init()
    try {
        await site.loadHome()
        const slugs = [
            ...(site.home?.newestShows ?? []).map(s => s.slug),
            ...(site.home?.newestEpisodes ?? []).map(e => e.slug),
            ...(site.home?.favorites ?? []).map(f => f.slug),
        ]
        await site.loadCovers(slugs)
        // The favorites API needs the show ids, which arrive together with the
        // covers. Sync the stored list with the nav's favorites. Only when
        // every nav favorite resolved do we treat the nav as the complete truth.
        const navFavorites = site.home?.favorites ?? []
        const navIds = navFavorites.map(f => site.showIds[f.slug])
        favoritesStore.sync(navIds, { complete: navFavorites.every(f => site.showIds[f.slug]) })
    } catch {
        // error is surfaced through site.error
    }
})

const recentlyWatched = computed(() =>
    (history.items ?? []).map(item => ({
        id: item.time,
        showName: item.title,
        episodeTitle: item.episode ? `Weiter bei S${item.season} E${item.episode}` : '',
        season: item.season ?? '',
        episode: item.episode ?? '',
        // The badge is uppercased for display; the link must carry the real
        // code, because the site matches it case-sensitively.
        language: shortLang(item.slug),
        image: item.cover || 'https://placehold.co/300x450',
        to: showLink(item.slug, {
            season: item.season,
            episode: item.episode,
            lang: settings.showLanguage(item.slug),
        }),
    }))
)

const episodes = computed(() =>
    (site.home?.newestEpisodes ?? []).map((e, i) => ({
        id: i,
        showName: e.title,
        // No separate episode title: the tile's own season/episode line below the
        // name already shows it. (The site also has no such field — an earlier
        // version read `e.info` here, which the extractor never produced.)
        episodeTitle: '',
        season: e.season,
        episode: e.episode,
        // No language badge here. It used to carry the site's full label
        // ("Deutsch") while the other tiles showed the bare code ("DE"); one
        // display is used now, and the remaining ones are the short code on
        // "Zuletzt angesehen" and the notification bar. The link still opens the
        // dub advertised here.
        language: '',

        image: site.covers[e.slug] || 'https://placehold.co/300x450',
        // …but the link opens the dub the site is advertising here, so the tile
        // and where it leads agree. Empty when no code could be read off the href.
        to: showLink(e.slug, { season: e.season, episode: e.episode, lang: e.languageCode }),
    }))
)

const favorites = computed(() =>
    (site.home?.favorites ?? []).map((f, i) => ({
        id: i,
        showName: f.title,
        episodeTitle: '',
        season: '',
        episode: '',
        // No language badge: a favorite is a whole show, and the dub it opens in
        // is the one already stored for it. The tile states nothing the show
        // page doesn't.
        language: '',
        image: site.covers[f.slug] || 'https://placehold.co/300x450',
        to: showLink(f.slug, { lang: shortLang(f.slug) }),
    }))
)

const shows = computed(() =>
    (site.home?.newestShows ?? []).map((s, i) => ({
        id: i,
        name: s.title,
        slug: s.slug,
        image: site.covers[s.slug] || 'https://placehold.co/64x88',
    }))
)
</script>
