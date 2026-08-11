<script setup>
import { RouterLink } from 'vue-router'

defineProps({
    showName: { type: String, default: '' },
    episodeTitle: { type: String, default: '' },
    season: { type: [Number, String], default: '' },
    episode: { type: [Number, String], default: '' },
    language: { type: String, default: '' },
    image: { type: String, default: 'https://placehold.co/300x450' },
    to: { type: [String, Object], default: '' },
})
</script>

<template>
    <component :is="to ? RouterLink : 'div'" :to="to || undefined"
        class="group relative h-full w-full rounded-xl overflow-hidden cursor-pointer bg-base-300 mr-2 block">
        <img :src="image" class="w-full h-full object-cover" />
        <div
            class="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition flex flex-col justify-end p-4 text-white">
            <h3 class="font-bold">{{ showName }}</h3>
            <p class="text-sm mt-1">{{ episodeTitle }}</p>
            <p v-if="season" class="text-xs opacity-80 mt-1">Staffel {{ season }} · Folge {{ episode }}</p>
            <div class="mt-2"><span v-if="language" class="badge badge-sm">{{ language }}</span></div>
        </div>
    </component>
</template>
