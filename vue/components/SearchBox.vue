<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSiteStore } from '../stores/site'

const router = useRouter()
const site = useSiteStore()

const searchQuery = ref('')
const searchInput = ref(null)

// Search kicks in only after at least 3 letters have been typed.
const canSearch = computed(() => searchQuery.value.trim().length >= 3)

// All shows are scraped once from /serie-alphabet and cached in the store.
const searching = computed(() => canSearch.value && !site.allShows)

const searchResults = computed(() => {
    const q = searchQuery.value.trim().toLowerCase()
    if (q.length < 3) return []
    return (site.allShows ?? [])
        .filter(s => s.title?.toLowerCase().includes(q))
        .slice(0, 12)
})

watch(canSearch, async (active) => {
    if (active && !site.allShows) {
        try {
            await site.loadAllShows()
        } catch {
            // error is surfaced through site.error
        }
    }
})

function selectShow(slug) {
    searchQuery.value = ''
    searchInput.value?.blur() // closes the focus-based dropdown
    router.push(`/show/${encodeURIComponent(slug)}`)
}
</script>

<template>
    <div class="flex-1 min-w-0 max-w-xl">
        <div class="dropdown dropdown-center w-full">
            <label class="input flex items-center gap-2 w-full">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 opacity-50" fill="none" viewBox="0 0 24 24"
                    stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="m21 21-4.35-4.35m0 0A7.5 7.5 0 1 0 6.5 6.5a7.5 7.5 0 0 0 10.15 10.15z" />
                </svg>
                <input ref="searchInput" v-model="searchQuery" type="search" class="grow"
                    placeholder="Serien suchen..." autocomplete="off" />
            </label>
            <ul tabindex="-1"
                class="dropdown-content menu bg-base-300 rounded-box z-50 w-full p-2 mt-2 shadow-xl max-h-96 overflow-y-auto">
                <li v-if="!canSearch">
                    <span class="text-xs opacity-50 px-4 py-2">Gib mindestens 3 Buchstaben ein, um zu suchen</span>
                </li>
                <template v-else>
                    <li v-if="searching">
                        <span class="text-xs opacity-60 px-4 py-2">Suche...</span>
                    </li>
                    <template v-else-if="searchResults.length">
                        <li v-for="r in searchResults" :key="r.slug">
                            <a @click="selectShow(r.slug)">
                                <span class="truncate">{{ r.title }}</span>
                            </a>
                        </li>
                    </template>
                    <li v-else>
                        <span class="text-xs opacity-50 px-4 py-2">Keine Treffer</span>
                    </li>
                </template>
            </ul>
        </div>
    </div>
</template>
