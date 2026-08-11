<script setup>
import { computed, nextTick, ref } from 'vue'
import { useSiteStore } from '../stores/site'

const site = useSiteStore()

const news = computed(() => site.home?.news ?? [])

const newsDialog = ref(null)
const selectedNews = ref(null)

function openNews(item) {
    selectedNews.value = item
    nextTick(() => newsDialog.value?.showModal())
}

function closeNews() {
    newsDialog.value?.close()
}
</script>

<template>
    <div class="dropdown dropdown-end">
        <label tabindex="0" class="btn btn-ghost btn-circle">
            <div class="indicator">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24"
                    stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span v-if="news.length" class="badge badge-xs badge-primary indicator-item">{{ news.length
                }}</span>
            </div>
        </label>
        <div tabindex="0"
            class="dropdown-content menu z-50 mt-3 w-80 max-w-[90vw] bg-base-300 rounded-box shadow-xl p-2 max-h-96 overflow-y-auto">
            <li class="menu-title">Nachrichten</li>
            <template v-if="news.length">
                <li v-for="(n, i) in news" :key="i">
                    <a @click="openNews(n)">
                        <span class="font-semibold text-sm block truncate">{{ n.title }}</span>
                        <span class="text-xs opacity-60 block">{{ n.time }}</span>
                    </a>
                </li>
            </template>
            <li v-else>
                <span class="text-xs opacity-50 px-4 py-2">Keine News</span>
            </li>
        </div>
    </div>

    <dialog ref="newsDialog" class="modal">
        <div class="modal-box max-w-[min(42rem,90vw)]">
            <h3 class="text-lg font-bold">{{ selectedNews?.title }}</h3>
            <p v-if="selectedNews?.time" class="text-xs opacity-60 mb-3">{{ selectedNews?.time }}</p>
            <div class="max-h-[60vh] overflow-y-auto" v-html="selectedNews?.content"></div>
            <div class="modal-action">
                <button class="btn" @click="closeNews()">Schließen</button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button>close</button>
        </form>
    </dialog>
</template>
