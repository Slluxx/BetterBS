<script setup>
defineProps({
    title: { type: String, default: 'Neue Serien' },
    items: { type: Array, default: () => [] },
})
</script>

<template>
    <aside class="bg-base-100 rounded-2xl shadow-sm p-4 lg:sticky lg:top-20">
        <h2 class="text-lg font-bold mb-3">{{ title }}</h2>
        <ul class="menu p-0 gap-1 w-full truncate overflow-hidden">
            <li v-for="item in items" :key="item.id" class="w-full">
                <RouterLink :to="'/show/' + item.slug" class="flex items-center gap-3 px-2 py-2 w-full">
                    <div class="w-8 h-11 rounded bg-base-300 overflow-hidden shrink-0">
                        <img :src="item.image" class="w-full h-full object-cover" />
                    </div>
                    <span class="text-sm truncate">{{ item.name }}</span>
                </RouterLink>
            </li>
        </ul>
    </aside>
</template>
