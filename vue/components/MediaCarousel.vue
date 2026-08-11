<script setup>
import { Carousel, Slide, Navigation } from 'vue3-carousel'
import PosterTile from './PosterTile.vue'

defineProps({
    title: { type: String, required: true },
    items: { type: Array, default: () => [] },
    itemsToShow: { type: Number, default: 2.2 },
    itemsToScroll: { type: Number, default: 2 },
})

// Fewer posters on small screens (aligned with Tailwind's sm/lg breakpoints).
// At lg+ the carousel keeps the original 6.5 posters, so the desktop layout
// is unchanged. The aspect ratio (itemsToShow / 1.5) must match, otherwise
// the poster tiles no longer line up with the container height.
const breakpoints = {
    640: { itemsToShow: 3.5, itemsToScroll: 3 },
    1024: { itemsToShow: 6.5, itemsToScroll: 6 },
}
</script>

<template>
    <div>
        <h2 class="text-2xl font-bold mb-4">{{ title }}</h2>
        <div class="aspect-[22/15] sm:aspect-[7/3] lg:aspect-[13/3] w-full">
            <Carousel class="h-full w-full" :items-to-show="itemsToShow" :items-to-scroll="itemsToScroll"
                :breakpoints="breakpoints" :wrap-around="false">
                <Slide v-for="item in items" :key="item.id">
                    <PosterTile v-bind="item" />
                </Slide>

                <template #addons>
                    <Navigation />
                </template>
            </Carousel>
        </div>
    </div>
</template>
