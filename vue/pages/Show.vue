<template>
    <SiteLayout>
        <div class="max-w-screen-2xl mx-auto px-3 sm:px-6 py-6 sm:py-8">

            <div v-if="site.loading && !show" class="flex justify-center py-24">
                <span class="loading loading-spinner loading-lg"></span>
            </div>

            <div v-else-if="site.error && !show" class="text-center opacity-70 py-24">
                Couldn't load show: {{ site.error }}
            </div>

            <template v-else-if="show">
                <ShowInfoCard :title="show.title" :description="show.description" :genres="genres"
                    :cover="cover" :season-count="seasonCount" :year="year"
                    :show-id="showId" :favorited="favorited" @toggle-favorite="toggleFavorite" />

                <PlayerSection v-if="isPlaying" :title="title" :season="season" :episode="episode"
                    :episodes="episodes" :languages="languages"
                    :hosters="currentEpisodeHosters" :selected-language="currentLanguage"
                    :stream-href="currentEpisode?.href ?? ''" :hoster="currentHoster"
                    @select-language="selectLanguage" @select-hoster="selectHoster"
                    @previous="previous" @next="next" @back-to-overview="backToOverview" />

                <EpisodeBrowser v-else :seasons="show.seasons" :episodes="episodes" :languages="languages"
                    :selected-season="currentSeason" :selected-language="currentLanguage"
                    @play="play" @select-season="selectSeason" @select-language="selectLanguage"
                    @toggle-watched="toggleWatched" />
            </template>

        </div>
    </SiteLayout>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSiteStore } from '../stores/site'
import { useHistoryStore } from '../stores/history'
import { useSettingsStore } from '../stores/settings'
import { useFavoritesStore } from '../stores/favorites'
import { useNotificationsStore } from '../stores/notifications'
import SiteLayout from '../components/SiteLayout.vue'
import ShowInfoCard from '../components/ShowInfoCard.vue'
import EpisodeBrowser from '../components/EpisodeBrowser.vue'
import PlayerSection from '../components/PlayerSection.vue'

const route = useRoute()
const router = useRouter()
const site = useSiteStore()
const history = useHistoryStore()
const settings = useSettingsStore()
const favorites = useFavoritesStore()
const notifications = useNotificationsStore()

const title = computed(() => route.params.title)
const season = computed(() => Number(route.params.season || 1))
const episode = computed(() => Number(route.params.episode))
const isPlaying = computed(() => route.params.episode !== undefined)

// The hoster is part of the URL (…/show/title/season/episode/hoster) so a
// shared/reloaded link restores the selected hoster. Param values may arrive
// encoded or decoded depending on the router version, so decode defensively.
function safeDecode(value) {
    if (!value) return ''
    try {
        return decodeURIComponent(value)
    } catch {
        return String(value)
    }
}
const currentHoster = computed(() => safeDecode(route.params.hoster))

const currentSeason = ref(Number(route.params.season || 1))
const currentLanguage = ref(settings.language)

onMounted(loadAll)
watch(() => route.params.title, loadAll)
watch(() => Number(route.params.season || 1), (s) => {
    if (s !== currentSeason.value) {
        currentSeason.value = s
        loadEpisodes()
    }
})
watch(() => route.params.episode, recordVisit)

async function loadAll() {
    if (!title.value) return
    currentSeason.value = Number(route.params.season || 1)
    try {
        const show = await site.loadShow(title.value)
        // Prefer the stored language when the show has it, otherwise its first.
        const langs = show?.languages ?? []
        currentLanguage.value = langs.some(l => l.code === settings.language)
            ? settings.language
            : (langs[0]?.code || 'de')
        await loadEpisodes()
        recordVisit()
    } catch {
        // error is surfaced through site.error
    }
}

function recordVisit() {
    // Only record once the player is actually shown. Merely browsing the
    // detail page shouldn't mark the show as watched (and "reset" it to an
    // arbitrary S1E1 in the history list).
    if (!isPlaying.value) return
    if (!site.show?.slug || site.show.slug !== title.value) return
    const ep = Number(route.params.episode)
    history.add({
        slug: site.show.slug,
        title: site.show.title,
        cover: site.show.cover,
        season: currentSeason.value,
        episode: Number.isNaN(ep) || ep < 1 ? 1 : ep,
    })
    // Visiting a new episode manually (search, carousel, browsing) must clear
    // its notification right away, not just on the next page refresh.
    notifications.markReached(
        site.show.slug,
        Number(route.params.season || currentSeason.value),
        Number.isNaN(ep) || ep < 1 ? 1 : ep,
    )
}

async function loadEpisodes() {
    if (!title.value) return
    try {
        await site.loadEpisodes({ slug: title.value, season: currentSeason.value, language: currentLanguage.value })
    } catch {
        // error is surfaced through site.error
    }
}

const show = computed(() => site.show?.slug === title.value ? site.show : null)
const episodes = computed(() =>
    site.episodes[`${title.value}|${currentSeason.value}|${currentLanguage.value}`] ?? []
)
const currentEpisode = computed(() => episodes.value.find(e => e.number === episode.value))
const currentEpisodeHosters = computed(() => currentEpisode.value?.hosters ?? [])

const genres = computed(() => show.value?.genres ?? [])
const cover = computed(() => show.value?.cover ?? '')
const description = computed(() => show.value?.description ?? '')
const seasonCount = computed(() => show.value?.seasons.length ?? 0)
const year = computed(() => show.value?.info['Produktionsjahre'] ?? '')
const languages = computed(() => show.value?.languages ?? [])
const showId = computed(() => site.show?.id ?? site.showIds[title.value] ?? null)
const favorited = computed(() => showId.value != null && favorites.contains(showId.value))

async function toggleFavorite() {
    if (showId.value == null) return
    const target = !favorited.value
    const { ok, error } = await favorites.toggle(showId.value, target)
    if (!ok) {
        console.error('[favorites] toggle failed:', error)
        return
    }
    // Keep the homepage carousel in sync without a reload: the carousel reads
    // the nav scraped at home-load time, which is now stale.
    if (site.home) {
        const slug = title.value
        const rest = (site.home.favorites ?? []).filter(f => f.slug !== slug)
        if (target && site.show) {
            site.home.favorites = [...rest, {
                title: site.show.title,
                slug,
                href: `/serie/${encodeURIComponent(slug)}`,
            }]
            if (site.show.cover) site.covers[slug] = site.show.cover
        } else {
            site.home.favorites = rest
        }
    }
    // A newly added favorite establishes its new-episode baseline right away
    // (the Header watcher doesn't fire because the home object was mutated).
    if (target) useNotificationsStore().checkFavorites()
}

function go(path) {
    router.push(`/show/${title.value}${path}`)
}

function play({ season, episode, hoster }) {
    if (hoster) settings.set({ hoster })
    go(`/${season}/${episode}${hoster ? `/${encodeURIComponent(hoster)}` : ''}`)
}

function selectSeason(s) {
    currentSeason.value = s
    loadEpisodes()
    go(`/${s}`)
}

function selectLanguage(code) {
    currentLanguage.value = code
    settings.set({ language: code })
    loadEpisodes()
}

function backToOverview() {
    go('')
}

function selectEpisode(n) {
    if (!Number.isFinite(n) || n < 1) return
    go(`/${currentSeason.value}/${n}`)
}

function selectHoster(h) {
    if (!isPlaying.value || !h) return
    settings.set({ hoster: h })
    go(`/${season.value}/${episode.value}/${encodeURIComponent(h)}`)
}

function previous() {
    selectEpisode(episode.value - 1)
}

function next() {
    selectEpisode(episode.value + 1)
}

async function toggleWatched(e) {
    if (!site.show?.slug) return
    await site.toggleWatched({
        slug: site.show.slug,
        season: currentSeason.value,
        language: currentLanguage.value,
        episode: e.number,
    })
}
</script>
