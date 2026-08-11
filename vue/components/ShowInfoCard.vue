<script setup>
defineProps({
    title: { type: String, required: true },
    cover: { type: String, default: 'https://burningseries.ac/public/images/cover/176.jpg' },
    description: { type: String, default: '' },
    genres: { type: Array, default: () => [] },
    seasonCount: { type: Number, default: 0 },
    year: { type: [Number, String], default: '' },
    // The numeric show id (from the cover URL) — the heart is only shown when
    // it's known, since toggling favorites requires it.
    showId: { type: [Number, String], default: null },
    favorited: { type: Boolean, default: false },
})

defineEmits(['toggle-favorite'])
</script>

<template>
    <section class="card bg-base-100 shadow-xl mb-8 relative">
        <button v-if="showId" class="btn btn-ghost btn-circle absolute top-3 right-3 z-10"
            :class="favorited ? 'text-error' : 'opacity-60 hover:opacity-100'"
            :title="favorited ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'"
            @click="$emit('toggle-favorite')">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7" viewBox="0 0 24 24"
                :fill="favorited ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round">
                <path
                    d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
        </button>

        <div class="card-body flex-col sm:flex-row gap-4 sm:gap-8">
            <img :src="cover" class="w-32 h-48 sm:w-44 sm:h-64 object-cover rounded-xl shadow-lg shrink-0 mx-auto sm:mx-0" />
            <div class="flex flex-col justify-center min-w-0">
                <h1 class="text-2xl sm:text-4xl font-bold">{{ title }}</h1>
                <div class="flex flex-wrap gap-2 mt-3">
                    <span v-for="g in genres" :key="g" class="badge badge-primary">{{ g }}</span>
                    <span v-if="seasonCount" class="badge">{{ seasonCount }} Staffeln</span>
                    <span v-if="year" class="badge">{{ year }}</span>
                </div>
                <p class="mt-5 text-sm sm:text-base leading-relaxed opacity-70 max-w-3xl">{{ description }}</p>
            </div>
        </div>
    </section>
</template>
