<script setup>
const props = defineProps({
    seasons: { type: Array, default: () => [] },
    episodes: { type: Array, default: () => [] },
    languages: { type: Array, default: () => [] },
    selectedSeason: { type: Number, default: 1 },
    selectedLanguage: { type: String, default: '' },
})

const emit = defineEmits(['play', 'select-season', 'select-language', 'toggle-watched'])

function play(e, hoster) {
    emit('play', { season: props.selectedSeason, episode: e.number, hoster })
}
</script>

<template>
    <section class="card bg-base-100 shadow-xl">
        <div class="card-body">

            <h2 class="text-xl font-bold mb-4">Folgen</h2>

            <!-- Language filter -->
            <div class="mb-4">
                <span class="text-sm font-semibold opacity-70 mr-2">Sprache</span>
                <div class="join flex-wrap">
                    <button v-for="l in languages" :key="l.code" class="btn btn-sm join-item"
                        :class="selectedLanguage === l.code ? 'btn-primary' : 'btn-outline'"
                        @click="emit('select-language', l.code)">
                        {{ l.label }}
                    </button>
                </div>
            </div>

            <!-- Seasons: wrapping buttons, capped so 100+ seasons don't grow the page -->
            <div class="flex flex-wrap gap-2 max-h-32 overflow-y-auto mb-5 p-1">
                <button v-for="s in seasons" :key="s.number" class="btn btn-sm"
                    :class="[
                        s.number === selectedSeason
                            ? 'btn-primary'
                            : (s.watched ? 'btn-outline btn-success' : 'btn-outline'),
                    ]"
                    @click="emit('select-season', s.number)">
                    {{ s.label }}
                </button>
                <p v-if="!seasons.length" class="text-sm opacity-60 py-2">
                    Staffeln werden geladen…
                </p>
            </div>

            <!-- fixed-height scroll container: page height stays constant regardless of episode count -->
            <div class="max-h-[640px] overflow-y-auto rounded-xl border border-base-300">
                <table class="table">
                    <thead class="sticky top-0 bg-base-100 z-10">
                        <tr>
                            <th class="w-12">#</th>
                            <th>Titel</th>
                            <th>Hoster</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="e in episodes" :key="e.number" class="hover"
                            :class="e.watched ? 'opacity-60' : ''">
                            <td class="w-16">
                                <div class="flex items-center gap-1.5">
                                    <button v-if="e.markHref" class="btn btn-xs btn-circle"
                                        :class="e.watched ? 'btn-success' : 'btn-outline'"
                                        :title="e.watched ? 'Als ungelesen markieren' : 'Als gesehen markieren'"
                                        @click="emit('toggle-watched', e)">
                                        <svg xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5" fill="none"
                                            viewBox="0 0 24 24" stroke="currentColor">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3"
                                                d="M5 13l4 4L19 7" />
                                        </svg>
                                    </button>
                                    <span :class="e.watched ? 'line-through' : 'opacity-60'">{{ e.number }}</span>
                                </div>
                            </td>
                            <td>
                                <span :class="e.watched ? 'line-through' : ''">{{ e.title }}</span>
                            </td>
                            <td>
                                <div class="flex gap-1.5 flex-wrap">
                                    <button v-for="h in e.hosters" :key="h" class="btn btn-xs sm:btn-sm" @click="play(e, h)">
                                        ▶ {{ h }}
                                    </button>
                                    <span v-if="!e.hosters.length" class="text-xs opacity-40 self-center">—</span>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <p v-if="!episodes.length" class="text-sm opacity-60 p-4">
                    Noch keine Folgen geladen.
                </p>
            </div>

        </div>
    </section>
</template>
