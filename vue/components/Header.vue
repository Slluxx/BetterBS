<script setup>
import { nextTick, onMounted, ref, watch } from 'vue'
import { useSiteStore } from '../stores/site'
import { useNotificationsStore } from '../stores/notifications'
import SearchBox from './SearchBox.vue'
import AccountMenu from './AccountMenu.vue'
import NewsMenu from './NewsMenu.vue'
import NotificationBanner from './NotificationBanner.vue'
import LoginDialog from './LoginDialog.vue'
import SettingsDialog from './SettingsDialog.vue'

const site = useSiteStore()
const notifications = useNotificationsStore()

onMounted(() => {
    // The homepage also loads it, but this guarantees news on any page.
    if (!site.home) site.loadHome().catch(() => { })
    // New-episode alerts for favorite shows are derived from each favorite's
    // own show page, so they're checked whenever home data (and thus the
    // favorites nav) is around.
    if (site.home) notifications.checkFavorites()
})

watch(() => site.home, (home) => {
    if (home) notifications.checkFavorites()
})

const settingsDialog = ref(null)

function openSettings() {
    nextTick(() => settingsDialog.value?.open())
}
</script>

<template>
    <header class="navbar bg-base-100 px-3 sm:px-6 shadow-sm sticky top-0 z-40">
        <div class="flex-none lg:flex-1">
            <RouterLink to="/" class="btn btn-ghost text-lg sm:text-xl font-bold">BurningSeries</RouterLink>
        </div>

        <SearchBox />

        <div class="flex-none lg:flex-1 flex justify-end gap-1 items-center">

            <AccountMenu @open-settings="openSettings" />

            <label for="chat-drawer" class="btn btn-ghost btn-circle drawer-button">
                <div class="indicator">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24"
                        stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8-1.5 0-2.9-.32-4.1-.88L3 20l1.05-3.24C3.38 15.44 3 13.78 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <span class="badge badge-xs badge-success indicator-item"></span>
                </div>
            </label>

            <NewsMenu />

        </div>
    </header>

    <NotificationBanner />
    <LoginDialog />
    <SettingsDialog ref="settingsDialog" />
</template>
