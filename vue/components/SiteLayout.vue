<script setup>
import Header from './Header.vue'
import Chat from './Chat.vue'
</script>

<template>
    <div class="drawer drawer-end">
        <input id="chat-drawer" type="checkbox" class="drawer-toggle" />

        <div class="drawer-content min-h-dvh bg-base-200">
            <Header />
            <slot />
        </div>

        <Chat />
    </div>
</template>
