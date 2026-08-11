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
})

const emit = defineEmits(['select-language', 'select-hoster', 'previous', 'next', 'back-to-overview'])

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
const hasNext = computed(() => props.episode < props.episodes.length)
const languageLabel = computed(() => {
    const lang = props.languages.find(l => l.code === props.selectedLanguage)
    return lang ? lang.label : (props.selectedLanguage || '—').toUpperCase()
})

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

                <button class="btn btn-primary btn-xs sm:btn-sm justify-self-end" :disabled="!hasNext"
                    @click="next">Weiter ▶</button>
            </div>

            <div class="aspect-video bg-black rounded-2xl shadow-inner overflow-hidden shrink-0 relative">
                <span v-if="player.loading"
                    class="loading loading-spinner loading-lg absolute inset-0 m-auto text-white"></span>
                <p v-else-if="player.error" class="opacity-70 p-4 text-center text-white">{{ player.error }}</p>
                <iframe v-else-if="player.embedUrl" ref="iframeEl" :src="player.embedUrl" class="w-full h-full border-0"
                    allow="fullscreen; autoplay; encrypted-media; picture-in-picture" allowfullscreen
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
