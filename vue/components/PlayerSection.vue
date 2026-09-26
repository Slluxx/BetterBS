<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { usePlayerStore } from '../stores/player'
import { useSettingsStore } from '../stores/settings'

const props = defineProps({
    title: { type: String, default: '' },
    season: { type: Number, required: true },
    episode: { type: Number, required: true },
    episodes: { type: Array, default: () => [] },
    languages: { type: Array, default: () => [] },
    hosters: { type: Array, default: () => [] },
    selectedLanguage: { type: String, default: '' },
    streamHref: { type: String, default: '' },
    hoster: { type: String, default: '' },
    // Whether "Weiter" can lead anywhere: the next episode is playable in the
    // loaded dub, or the season offers another language that may have it, or
    // there is a following season.
    canGoNext: { type: Boolean, default: false },
    // The next episode IS playable in the loaded dub, so "Weiter" just moves on
    // instead of opening a menu.
    nextPlayable: { type: Boolean, default: false },
    // Menu state. The alternatives are only resolved when the button is pressed,
    // so nothing about the next episode is announced before the user asks.
    nextMenuOpen: { type: Boolean, default: false },
    // Languages where the next episode IS available, once looked up.
    nextOptions: { type: Array, default: () => [] },
    // The following season, once looked up. 0 = none.
    nextSeason: { type: Number, default: 0 },
    nextLoading: { type: Boolean, default: false },
    // Whether the lookup has run. Distinguishes "not checked yet" from "checked,
    // available nowhere", which are the same empty list but mean different things.
    nextResolved: { type: Boolean, default: false },
    // The lookup itself failed, so "available nowhere" would be a lie.
    nextFailed: { type: Boolean, default: false },
})

const emit = defineEmits([
    'select-language', 'select-hoster', 'previous', 'next', 'continue-in',
    'continue-in-season', 'close-next-menu', 'back-to-overview',
])

const player = usePlayerStore()
const settings = useSettingsStore()

// Fullscreen the <iframe> element from our side instead of relying on the
// hoster's own (often blocked) fullscreen button. Requesting fullscreen on an
// iframe in the top-level document needs no cooperation from the inner page.
const iframeEl = ref(null)
const isFullscreen = ref(false)

function toggleFullscreen() {
    const el = iframeEl.value
    if (document.fullscreenElement) {
        document.exitFullscreen()
    } else if (el?.requestFullscreen) {
        el.requestFullscreen()
    }
}

function onFullscreenChange() {
    isFullscreen.value = document.fullscreenElement === iframeEl.value
}

onMounted(() => document.addEventListener('fullscreenchange', onFullscreenChange))
onUnmounted(() => document.removeEventListener('fullscreenchange', onFullscreenChange))

const currentEpisodeTitle = computed(() =>
    props.episodes.find(e => e.number === props.episode)?.title ?? `Episode ${props.episode}`
)
const hasPrevious = computed(() => props.episode > 1)
const languageLabel = computed(() => {
    const lang = props.languages.find(l => l.code === props.selectedLanguage)
    return lang ? lang.label : (props.selectedLanguage || '—').toUpperCase()
})
// Plain "Weiter" when the next episode is right here. Otherwise it opens a menu
// of the ways forward, so the button says so before it is pressed.
const nextLabel = computed(() => (props.nextPlayable ? 'Weiter ▶' : 'Weiter ▶ …'))

// Whether the menu has nothing to offer, so it can say that instead of listing
// empty rows. Only meaningful once the lookup has run, and never claimed when the
// lookup itself failed.
const nextEmpty = computed(() =>
    props.nextResolved
    && !props.nextFailed
    && !props.nextOptions.length
    && !props.nextSeason)

function next() { emit('next') }
function previous() { emit('previous') }
function backToOverview() { emit('back-to-overview') }
function selectLanguage(code) { emit('select-language', code) }

function loadStream(hoster) {
    if (!props.streamHref) return
    player.loadStream({ url: props.streamHref, hoster })
}

function selectHoster(h) {
    if (!props.streamHref) return
    emit('select-hoster', h)
}

// Auto-start the stream as soon as the player opens, and again whenever the
// episode or its hosters change. The hoster comes from the URL when present
// (so a shared link or a reload keeps the choice); otherwise fall back to the
// preferred hoster from the settings, then the first hoster.
let loadedKey = ''

watch(
    () => [props.streamHref, props.hoster, props.hosters[0]],
    ([href, urlHoster, firstHoster]) => {
        if (!href) return
        const target = urlHoster && props.hosters.includes(urlHoster)
            ? urlHoster
            : (settings.hoster && props.hosters.includes(settings.hoster) ? settings.hoster : firstHoster)
        if (!target) return
        const key = `${href}|${target}`
        if (key === loadedKey) return
        loadedKey = key
        loadStream(target)
    },
    { immediate: true },
)
</script>

<template>
    <section class="card bg-base-100 shadow-xl">
        <div class="card-body">

            <div class="text-center mb-5 shrink-0">
                <h2 class="text-xl sm:text-2xl font-bold">{{ currentEpisodeTitle }}</h2>
                <p class="opacity-60 mt-1">Staffel {{ season }} · Folge {{ episode }}</p>
            </div>

            <div class="grid grid-cols-3 items-center mb-5 shrink-0">
                <button class="btn btn-primary btn-xs sm:btn-sm justify-self-start" :disabled="!hasPrevious"
                    @click="previous">◀ Zurück</button>

                <button class="btn btn-outline btn-xs sm:btn-sm justify-self-center" @click="backToOverview">📋 Alle
                    Folgen</button>

                <!-- Plain jump when the next episode is in this dub; otherwise a
                     menu of the ways forward. Nothing is announced up front.
                     The panel is shown purely on `v-if` and positioned by us,
                     rather than relying on a dropdown's focus-driven CSS, so it
                     cannot end up rendered-but-invisible. -->
                <div class="relative justify-self-end">
                    <button class="btn btn-xs sm:btn-sm"
                        :class="nextPlayable ? 'btn-primary' : 'btn-warning'" :disabled="!canGoNext"
                        @click="next">{{ nextLabel }}</button>

                    <!-- Click catcher: closes the menu on any outside press. -->
                    <div v-if="nextMenuOpen" class="fixed inset-0 z-30" @click="emit('close-next-menu')"></div>

                    <div v-if="nextMenuOpen" role="menu"
                        class="absolute right-0 bottom-full z-40 mb-2 w-64 rounded-box bg-base-300 shadow-xl">
                        <!-- `w-full` on the list and on every row: DaisyUI only makes a
                             menu item full-width when it is an interactive child, so the
                             <li> wrappers and the <ul> need to be told explicitly. -->
                        <ul class="menu w-full p-0">
                            <li v-if="nextLoading" class="w-full px-4 py-2">
                                <span class="flex w-full items-center gap-2 text-xs opacity-70">
                                    <span class="loading loading-spinner loading-xs"></span>
                                    Andere Sprachen werden geprüft…
                                </span>
                            </li>
                            <li v-for="o in nextOptions" :key="o.code" class="w-full">
                                <a class="w-full" @click="emit('continue-in', o.code)">
                                    <span class="flex w-full items-center justify-between gap-2">
                                        <span>{{ o.label }} ▶</span>
                                        <span class="opacity-60 text-xs">Folge {{ episode + 1 }}</span>
                                    </span>
                                </a>
                            </li>
                            <li v-if="nextSeason" class="w-full">
                                <a class="w-full" @click="emit('continue-in-season', nextSeason)">
                                    <span class="flex w-full items-center justify-between gap-2">
                                        <span>Staffel {{ nextSeason }}, Folge 1 ▶</span>
                                    </span>
                                </a>
                            </li>
                            <li v-if="nextFailed" class="w-full px-4 py-2">
                                <span class="block w-full text-xs text-error">
                                    Andere Sprachen konnten nicht geprüft werden.
                                </span>
                            </li>
                            <li v-else-if="nextEmpty" class="w-full px-4 py-2">
                                <span class="block w-full text-xs opacity-70">
                                    Keine weitere Folge verfügbar.
                                </span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            <div class="aspect-video bg-black rounded-2xl shadow-inner overflow-hidden shrink-0 relative">
                <span v-if="player.loading"
                    class="loading loading-spinner loading-lg absolute inset-0 m-auto text-white"></span>
                <p v-else-if="player.error" class="opacity-70 p-4 text-center text-white">{{ player.error }}</p>
                <iframe v-else-if="player.embedUrl" ref="iframeEl" :src="player.embedUrl" class="w-full h-full border-0"
                    allow="fullscreen; autoplay; encrypted-media; picture-in-picture"
                    webkitallowfullscreen mozallowfullscreen msallowfullscreen></iframe>
                <button v-if="player.embedUrl && !isFullscreen" @click="toggleFullscreen"
                    class="btn btn-ghost btn-circle absolute top-2 right-2 text-white bg-black/50 hover:bg-black/70"
                    title="Vollbild">
                    ⛶
                </button>
                <div v-else-if="player.result"
                    class="w-full h-full flex flex-col items-center justify-center gap-3 text-white">
                    <p class="opacity-70">Stream bereit · {{ player.hoster }}</p>
                    <a v-if="player.result.link" :href="player.result.link" target="_blank" rel="noopener"
                        class="btn btn-primary btn-sm">Stream öffnen</a>

                </div>
                <span v-else class="absolute inset-0 m-auto w-max text-white opacity-70">Videoplayer</span>
            </div>

            <div class="flex justify-between items-center mt-4 shrink-0">
                <div class="join">
                    <div class="dropdown dropdown-bottom">
                        <button tabindex="0" role="button" class="btn btn-xs sm:btn-sm join-item">🌐 {{ languageLabel }} ▾</button>
                        <ul tabindex="0"
                            class="dropdown-content menu bg-base-300 rounded-box shadow-xl w-48 mt-2 max-h-96 overflow-y-auto">
                            <li v-for="l in languages" :key="l.code">
                                <a @click="selectLanguage(l.code)">{{ l.label }}</a>
                            </li>
                        </ul>
                    </div>

                    <div class="dropdown dropdown-bottom">
                        <button tabindex="0" role="button" class="btn btn-xs sm:btn-sm join-item">▶ {{ player.hoster }} ▾</button>
                        <ul tabindex="0"
                            class="dropdown-content menu bg-base-300 rounded-box shadow-xl w-48 mt-2 max-h-96 overflow-y-auto">
                            <li v-for="h in hosters" :key="h">
                                <a @click="selectHoster(h)">{{ h }}</a>
                            </li>
                            <li v-if="!hosters.length">
                                <span class="px-4 py-2 text-xs opacity-60">Keine Hoster</span>
                            </li>
                        </ul>
                    </div>
                </div>

            </div>

        </div>
    </section>
</template>
