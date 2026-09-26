<script setup>
import { useSessionStore } from '../stores/session'

const session = useSessionStore()

defineEmits(['open-settings'])
</script>

<template>
    <div v-if="session.loggedIn" class="dropdown dropdown-end">
        <label tabindex="0" class="btn btn-ghost">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 sm:hidden" fill="none" viewBox="0 0 24 24"
                stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
            <span class="hidden sm:inline">{{ session.username || 'Account' }}</span>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 opacity-60" fill="none" viewBox="0 0 24 24"
                stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19 9-7 7-7-7" />
            </svg>
        </label>
        <ul tabindex="-1" class="dropdown-content menu bg-base-300 rounded-box z-50 mt-3 p-2 shadow-xl w-40">
            <li><a @click="$emit('open-settings')">Einstellungen</a></li>
            <li><a @click="session.logout">Abmelden</a></li>
        </ul>
    </div>

    <template v-else>
        <button class="btn btn-ghost" @click="session.openLogin()">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 sm:hidden" fill="none" viewBox="0 0 24 24"
                stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
            <span class="hidden sm:inline">Anmelden</span>
        </button>
    </template>
</template>
