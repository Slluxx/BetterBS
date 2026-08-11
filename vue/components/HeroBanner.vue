<script setup>
defineProps({
    title: { type: String, default: 'Willkommen zurück' },
    subtitle: { type: String, default: 'Das Neueste und was als Nächstes kommt.' },
    background: { type: String, default: 'https://burningseries.ac/public/images/header.png' },
})
</script>

<template>
    <section class="relative h-52 lg:h-72 overflow-hidden">
        <!-- Below lg: the banner image fills the whole band. -->
        <img :src="background" alt="" class="lg:hidden absolute inset-0 w-full h-full object-cover opacity-40" />

        <!-- lg and up: framed banner image (original design). -->
        <div class="hidden lg:block max-w-screen-2xl mx-auto px-6 py-8 rounded-xl opacity-40">
            <img :src="background" class="w-full h-full object-cover rounded-xl" />
        </div>

        <div class="absolute inset-0 bg-gradient-to-t from-base-200 via-base-200/60 to-base-200/10"></div>
        <div class="absolute inset-0 flex flex-col items-center justify-center text-center px-4 lg:px-6">
            <h1 class="text-2xl lg:text-3xl font-bold">{{ title }}</h1>
            <p class="mt-2 opacity-70">{{ subtitle }}</p>
        </div>
    </section>
</template>
