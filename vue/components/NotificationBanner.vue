<script setup>
import { useRouter } from 'vue-router'
import { useNotificationsStore } from '../stores/notifications'

const router = useRouter()
const notifications = useNotificationsStore()

function openNotification(n) {
    notifications.markRead(n)
    // Carry the notified language along so the show opens in the dub the alert
    // was raised for, rather than whatever the show would otherwise default to.
    router.push({
        path: `/show/${encodeURIComponent(n.slug)}/${n.season}/${n.episode}`,
        query: n.language ? { lang: n.language } : {},
    })
}

// The alert names the language it was raised for, which is the one chosen for
// that show. Show the short code so two dubs of the same show are
// distinguishable at a glance, with the full label as the tooltip.
function shortLang(n) {
    return n.language ? n.language.toUpperCase() : ''
}
</script>

<template>
    <div v-if="notifications.unread.length" class="bg-warning/15 border-b border-warning/30 px-3 sm:px-6 py-2 flex items-center gap-3 flex-wrap">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-warning shrink-0" fill="none" viewBox="0 0 24 24"
            stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        <span class="font-semibold text-sm">Neue Folgen deiner Favoriten:</span>
        <div v-for="n in notifications.unread" :key="`${n.slug}|${n.season}|${n.episode}`" class="join">
            <button class="btn btn-xs btn-warning btn-outline join-item normal-case gap-1.5"
                @click="openNotification(n)">
                {{ n.title }} · S{{ n.season }} E{{ n.episode }}
                <span v-if="shortLang(n)" class="badge badge-xs badge-warning"
                    :title="n.languageLabel || n.language">{{ shortLang(n) }}</span>
            </button>
            <button class="btn btn-xs btn-warning btn-outline join-item px-2" title="Ausblenden"
                @click="notifications.dismiss(n)">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" fill="none" viewBox="0 0 24 24"
                    stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18 18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
        <button class="btn btn-xs btn-ghost ml-auto" @click="notifications.markAllRead">Erledigt</button>
    </div>
</template>
