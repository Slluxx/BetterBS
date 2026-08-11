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

const site = useSiteStore()
const history = useHistoryStore()
const favoritesStore = useFavoritesStore()

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
        image: item.cover || 'https://placehold.co/300x450',
        to: item.episode ? `/show/${item.slug}/${item.season}/${item.episode}` : `/show/${item.slug}`,
    }))
)

const episodes = computed(() =>
    (site.home?.newestEpisodes ?? []).map((e, i) => ({
        id: i,
        showName: e.title,
        episodeTitle: e.info,
        season: e.season,
        episode: e.episode,
        language: e.language,
        image: site.covers[e.slug] || 'https://placehold.co/300x450',
        to: e.season && e.episode ? `/show/${e.slug}/${e.season}/${e.episode}` : `/show/${e.slug}`,
    }))
)

const favorites = computed(() =>
    (site.home?.favorites ?? []).map((f, i) => ({
        id: i,
        showName: f.title,
        episodeTitle: '',
        season: '',
        episode: '',
        language: '',
        image: site.covers[f.slug] || 'https://placehold.co/300x450',
        to: `/show/${f.slug}`,
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
