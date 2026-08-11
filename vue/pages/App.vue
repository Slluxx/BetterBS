<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import SeriesUrl from '@/utils/UrlParseBuild.js'
import originalUrl from '@/utils/originalUrl'
import { useSessionStore } from '../stores/session'

const session = useSessionStore()
session.checkLoginCookie()

const router = useRouter()

onMounted(async () => {
    // Detect a session the cookie check can't see (HttpOnly id cookie).
    session.restoreSession()

    // A shared/reloaded deep link (.../#/show/Supernatural/1/2) is restored
    // by the hash router on startup — don't override it with a page-path
    // guess. A bare "#/" is just the router's own empty state after re-basing
    // the URL, so the page-path guess still applies then.
    const hash = location.hash
    if (hash.length > 2 && hash.startsWith('#/')) return

    // `originalUrl` holds the URL as it was before the hash router re-based it.
    const parsed = SeriesUrl.parse(originalUrl)

    if (parsed.title) {
        let path = `/show/${parsed.title}/${parsed.season}`
        if (parsed.episode) path += `/${parsed.episode}`
        if (parsed.hosterExplicit && parsed.hoster) {
            path += `/${encodeURIComponent(parsed.hoster)}`
        }
        router.push(path)
    }
})
</script>

<template>
    <div>
        <RouterView />
    </div>
</template>
