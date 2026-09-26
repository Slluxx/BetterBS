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

                <!-- Two different gaps, two different messages: the whole dub is
                     missing for this season, vs. this one episode hasn't been
                     released in it yet. -->
                <div v-if="substitutedLanguage" role="status"
                    class="mt-3 rounded-lg bg-warning/15 border border-warning/30 px-3 py-2 flex items-center gap-2 text-sm flex-wrap">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-warning shrink-0" fill="none"
                        viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                    <span>
                        <strong>{{ languageLabel(substitutedLanguage.wanted) }}</strong> ist für diese Staffel nicht
                        verfügbar — angezeigt wird
                        <strong>{{ languageLabel(substitutedLanguage.shown) }}</strong>.
                    </span>
                </div>

                <div v-if="episodeUnavailable" role="status"
                    class="mt-3 rounded-lg bg-warning/15 border border-warning/30 px-3 py-2 flex items-center gap-2 text-sm flex-wrap">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-warning shrink-0" fill="none"
                        viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                    <span>
                        <strong>Folge {{ episodeUnavailable.number }}</strong> ist in
                        <strong>{{ languageLabel(episodeUnavailable.language) }}</strong> noch nicht verfügbar.
                    </span>
                </div>

                <PlayerSection v-if="isPlaying" :title="title" :season="season" :episode="episode"
                    :episodes="episodes" :languages="languages"
                    :hosters="currentEpisodeHosters" :selected-language="currentLanguage"
                    :stream-href="currentEpisode?.href ?? ''" :hoster="currentHoster"
                    :can-go-next="canGoNext" :next-menu-open="nextMenuOpen" :next-options="nextElsewhere ?? []"
                    :next-season="nextSeasonOption" :next-loading="checkingNext"
                    :next-resolved="nextElsewhere !== null" :next-playable="nextPlayableHere"
                    :next-failed="nextFailed"
                    @select-language="selectLanguage" @select-hoster="selectHoster"
                    @previous="previous" @next="next" @continue-in="continueIn"
                    @continue-in-season="continueInSeason" @close-next-menu="nextMenuOpen = false"
                    @back-to-overview="backToOverview" />

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
import { error as logError } from '@/utils/log.js'
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

// Route params may arrive encoded or decoded depending on the router version,
// so decode defensively. This applies to the title too, not just the hoster:
// the site's own URLs percent-encode slugs, and site.js re-encodes whatever it
// is handed, so an undecoded title would be double-encoded into a 404.
const title = computed(() => safeDecode(route.params.title))
const season = computed(() => Number(route.params.season || 1))
const episode = computed(() => Number(route.params.episode))
const isPlaying = computed(() => route.params.episode !== undefined)

function safeDecode(value) {
    if (!value) return ''
    try {
        return decodeURIComponent(value)
    } catch {
        return String(value)
    }
}
const currentHoster = computed(() => safeDecode(route.params.hoster))

// The language the show should open in, when the URL names one. The new-episode
// banner and the carousels link here with ?lang= so an entry about a specific
// dub actually opens that dub. It rides in the query rather than the path
// because the path already ends in an optional hoster, and inserting a language
// before it would make existing shared hoster links ambiguous. Vue Router types
// query values as possibly-repeated, so only a plain string is a usable code.
const routeLanguage = computed(() => {
    const lang = route.query.lang
    // Lowercased because the site matches these codes case-sensitively, and a
    // link built from a display label ("DE") is a request for a language the
    // season doesn't have — the site would answer with its default instead.
    return typeof lang === 'string' ? safeDecode(lang).toLowerCase() : ''
})

const currentSeason = ref(Number(route.params.season || 1))
const currentLanguage = ref('')

// The language the user WANTS for this show: the one named in the URL, else the
// one they picked here before. Deliberately kept apart from currentLanguage,
// which is what the current season can actually serve — a show can gain a dub
// in a later season, so the preference may be unavailable right now and valid
// again on the next season. Falling back must not overwrite it.
const preferredLanguage = computed(() =>
    routeLanguage.value || settings.showLanguage(title.value)
)

// What to try for the current season before the site has told us what it has.
// Not validated against any list: the only authoritative list is the season
// page's own <select>, and loadEpisodes applies it once the page is in.
function preferredOrDefault() {
    // With no stored choice, defer to the season's own default (learned by
    // loadSeason) rather than the overview's first language. The two differ:
    // the site opens Bookworm season 4 in German, but its overview lists
    // German Sub first, which is only season 1's dub.
    return preferredLanguage.value
        || site.defaultFor(title.value, currentSeason.value)
        || show.value?.languages?.[0]?.code
        || 'de'
}

onMounted(loadAll)
watch(() => route.params.title, loadAll)
watch(() => Number(route.params.season || 1), (s) => {
    if (s !== currentSeason.value) {
        currentSeason.value = s
        // Re-resolve from the preference: last season may have forced a
        // fallback, and this one may well have the preferred dub after all.
        currentLanguage.value = preferredOrDefault()
        loadEpisodes()
    }
})
watch(() => route.params.episode, recordVisit)
// A ?lang= change that didn't come from selectLanguage (browser back/forward,
// or a banner link) has to be applied and its episode list reloaded. The guard
// keeps it from double-loading after selectLanguage, which already did both.
// The code is not checked against a language list here: a link can name a dub
// that only later seasons have, and loadEpisodes corrects it if this season
// turns out not to offer it.
watch(routeLanguage, (wanted) => {
    if (!wanted || wanted === currentLanguage.value) return
    currentLanguage.value = wanted
    loadEpisodes()
})

async function loadAll() {
    if (!title.value) return
    currentSeason.value = Number(route.params.season || 1)
    try {
        await site.loadShow(title.value)
        // First visit to this show, so nothing is stored for it: ask the site
        // which language it defaults to for this season. A season URL carrying
        // no language is the only route that reveals that — every other route
        // has to name one. It also caches the default's episodes under their
        // real key, so adopting it below costs no second request.
        if (!settings.showLanguage(title.value) && !routeLanguage.value) {
            await site.loadSeason({ slug: title.value, season: currentSeason.value })
        }
        currentLanguage.value = preferredOrDefault()
        await loadEpisodes()
        // Every show ends up with an explicit language, so a later new-episode
        // check never has to guess one. Record what is actually on screen —
        // by now currentLanguage is the language the site served. A choice the
        // user already made is never overwritten here; this only fills a gap.
        if (!settings.showLanguage(title.value) && currentLanguage.value) {
            pickLanguage(currentLanguage.value, { rebuild: false })
        }
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
        language: currentLanguage.value,
    })
    // Visiting a new episode manually (search, carousel, browsing) must clear
    // its notification right away, not just on the next page refresh.
    notifications.markReached(
        site.show.slug,
        Number(route.params.season || currentSeason.value),
        Number.isNaN(ep) || ep < 1 ? 1 : ep,
    )
}

// `force` re-reads the season page instead of taking the cached list. The cache
// is the whole reason a freshly watched episode can still look unwatched: the
// site's player page marks it seen as a side effect of our own request for the
// stream, and nothing here would otherwise throw our stale copy away.
async function loadEpisodes(force = false) {
    if (!title.value) return
    const { slug, season } = { slug: title.value, season: currentSeason.value }
    try {
        await site.loadEpisodes({ slug, season, language: currentLanguage.value }, { force })
        // Asking for a dub this season doesn't have does not fail — the site
        // answers with that season's default instead, so what came back may not
        // be the dub we asked for. Adopt the language actually served and load
        // it under its own key. The stored preference is left alone: it is
        // probably still valid, just not for this season.
        const served = site.servedLanguage(slug, season, currentLanguage.value)
        if (served && served !== currentLanguage.value) {
            currentLanguage.value = served
            // Forced too: a list cached under the served language would
            // otherwise be adopted here, still carrying the pre-watch markers.
            await site.loadEpisodes({ slug, season, language: served }, { force })
        }
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
// The picker must offer what THIS season has, not what the show overview lists:
// a show that gains a dub later would otherwise never show the new language.
// Falls back to the overview list until the season page has been fetched.
const languages = computed(() =>
    site.languagesFor(title.value, currentSeason.value, show.value?.languages ?? [])
)

// Set when the show's language is unavailable here and the site's default was
// served in its place. Null in the normal case. Gated on the wanted code really
// being absent from the season's list, so a failed or pending request can't
// masquerade as a substitution.
const substitutedLanguage = computed(() => {
    const wanted = preferredLanguage.value
    const shown = currentLanguage.value
    if (!wanted || !shown || wanted === shown) return null
    if (languages.value.some(l => l.code === wanted)) return null
    return { wanted, shown }
})

// Set when the episode in the URL isn't playable in the dub that's loaded. The
// site keeps a row for every episode of the season and disables the ones this
// language hasn't released yet, so this is how a per-episode gap surfaces — the
// dub can be perfectly valid for the season while missing its latest episodes.
const episodeUnavailable = computed(() => {
    if (!isPlaying.value) return null
    if (!episodes.value.some(e => e.number === episode.value && e.disabled)) return null
    return { number: episode.value, language: currentLanguage.value }
})

// Human name for a language code. The wanted one can be missing from this
// season's list — that's the whole point of the notice — so the show overview's
// list is consulted before falling back to the bare code.
function languageLabel(code) {
    if (!code) return ''
    const entry = languages.value.find(l => l.code === code)
        ?? (show.value?.languages ?? []).find(l => l.code === code)
    return entry?.label ?? code.toUpperCase()
}
const showId = computed(() => site.show?.id ?? site.showIds[title.value] ?? null)
const favorited = computed(() => showId.value != null && favorites.contains(showId.value))

async function toggleFavorite() {
    if (showId.value == null) return
    const target = !favorited.value
    const { ok, error } = await favorites.toggle(showId.value, target)
    if (!ok) {
        logError('[favorites] toggle failed:', error)
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

function go(path, query = route.query) {
    // title is decoded, so re-encode it before splicing it into the path, or a
    // slug with a space or '/' would break the route. Keep ?lang= across
    // in-page navigation too: pushing a bare string drops the query, so
    // switching season/episode/hoster would silently switch the show's language.
    router.push({ path: `/show/${encodeURIComponent(title.value)}${path}`, query })
}

function play({ season, episode, hoster }) {
    if (hoster) settings.set({ hoster })
    go(`/${season}/${episode}${hoster ? `/${encodeURIComponent(hoster)}` : ''}`)
}

function selectSeason(s) {
    currentSeason.value = s
    currentLanguage.value = preferredOrDefault()
    loadEpisodes()
    go(`/${s}`)
}

// Records the language for this show and rebuilds its new-episode alerts, which
// are derived per language. `rebuild` is false only for the first-time gap fill
// on load, where there is no previous language to invalidate.
function pickLanguage(code, { rebuild = true } = {}) {
    currentLanguage.value = code
    // Recorded per show, never globally: the choice is about THIS show only.
    settings.setShowLanguage(title.value, code)
    if (rebuild) {
        useNotificationsStore().languageChanged(title.value)
            .catch(() => { })
    }
}

function selectLanguage(code) {
    // Recorded per show, never globally: the choice is about THIS show only.
    pickLanguage(code)
    loadEpisodes()
    // Keep the URL truthful so the view is shareable/reload-safe. `replace`,
    // not `push`: toggling languages shouldn't stack up history entries.
    router.replace({ query: { ...route.query, lang: code } })
}

// Back to the episode list of the season that was just playing. The season has
// to stay in the route: dropping it (as `go('')` did) left the watcher above
// reading `Number(undefined || 1)`, which reset the view to season 1 and
// reloaded it. Re-read the list afterwards so the episode just watched is
// marked seen, the same way a page refresh would, without the reload.
async function backToOverview() {
    go(`/${currentSeason.value}`)
    await loadEpisodes(true)
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

// What happens at the end of the current episode. Two things can follow it: the
// next episode in this dub, or — when the dub has stopped releasing but the show
// has — the next season. The site lists a row for every episode of the season, so
// "the next episode" can be missing from the loaded dub while existing in another
// language this season offers (Yani Neko S1: German stops at 9, German Sub has
// 12). None of that is announced: it is resolved when the user presses "Weiter",
// because a warning about an episode that isn't playing yet is noise.
const nextNumber = computed(() => (isPlaying.value ? episode.value + 1 : 0))
const nextPlayableHere = computed(() =>
    !!episodes.value.find(e => e.number === nextNumber.value && !e.disabled))
// Languages of this season other than the one on screen.
const otherLanguages = computed(() =>
    languages.value.filter(l => l.code !== currentLanguage.value))
// The season after this one, when the show actually has it.
const nextSeason = computed(() => {
    const wanted = currentSeason.value + 1
    return (show.value?.seasons ?? []).some(s => s.number === wanted) ? wanted : 0
})
// Somewhere to go: the next episode, another language that may have it, or the
// next season. A yellow button is a QUESTION, not a dead end: it stays clickable
// even when the answer turns out to be "nowhere", because a button that refuses
// to respond gives the user nothing to act on. Disabling it here is what made it
// look broken.
const canGoNext = computed(() => !!nextNumber.value)

// Which other languages have the next episode, and which season continues the
// story. Resolved on demand: each language costs a request, so it is only spent
// when the user actually presses the button. null = not looked up yet.
const nextElsewhere = ref(null)
const nextSeasonOption = ref(0)
const checkingNext = ref(false)
const nextFailed = ref(false)
const nextMenuOpen = ref(false)

// Any of these changing invalidates a lookup made for a different target.
watch([nextNumber, currentLanguage, currentSeason], () => {
    nextElsewhere.value = null
    nextSeasonOption.value = 0
    nextFailed.value = false
    nextMenuOpen.value = false
})

async function resolveNext() {
    if (nextElsewhere.value !== null || checkingNext.value) return
    const target = nextNumber.value
    nextSeasonOption.value = nextSeason.value
    const candidates = otherLanguages.value
    if (!candidates.length) {
        nextElsewhere.value = []
        return
    }
    checkingNext.value = true
    try {
        const found = []
        for (const l of candidates) {
            const list = await site.loadEpisodes({
                slug: title.value,
                season: currentSeason.value,
                language: l.code,
            })
            if (list.some(e => e.number === target && !e.disabled)) {
                found.push({ code: l.code, label: l.label })
            }
        }
        nextElsewhere.value = found
    } catch {
        // A failed request is not the same answer as "available nowhere", and
        // must not be reported as one.
        nextFailed.value = true
        nextElsewhere.value = []
    } finally {
        checkingNext.value = false
    }
}

async function next() {
    // The plain case: just move on, no menu, no extra requests.
    if (nextPlayableHere.value) {
        selectEpisode(nextNumber.value)
        return
    }
    nextMenuOpen.value = true
    await resolveNext()
}

// Switching dub to reach an episode: a deliberate choice, so it becomes the
// show's stored preference, and the view follows in one navigation.
async function continueIn(code) {
    const target = nextNumber.value
    nextMenuOpen.value = false
    pickLanguage(code)
    await loadEpisodes()
    go(`/${currentSeason.value}/${target}`, { ...route.query, lang: code })
}

// Continuing with the following season when the current one has ended in this
// dub. The language carries over: the choice is per show, not per season.
function continueInSeason(season) {
    nextMenuOpen.value = false
    go(`/${season}/1`)
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
