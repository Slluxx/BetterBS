<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import SeriesUrl from '@/utils/UrlParseBuild.js'
import originalUrl from '@/utils/originalUrl'
import { useSessionStore } from '../stores/session'
import { useSiteStore } from '../stores/site'

const session = useSessionStore()
session.checkLoginCookie()

const site = useSiteStore()

const router = useRouter()

onMounted(async () => {
    // Detect a session the cookie check can't see (HttpOnly id cookie).
    if (await session.restoreSession()) {
        // The nav was already scraped as a guest, so the favorites in it are the
        // site's demo set rather than the account's. Re-scrape now that we know
        // there is an account; the header's site.home watcher re-runs the
        // new-episode check against the real list. Deliberately no check of its
        // own here: if this refresh fails the demo list stays, and checking it
        // would raise alerts for shows the user never chose.
        await site.refreshFavorites()
    }

    // A shared/reloaded deep link (.../#/show/Supernatural/1/2) is restored
    // by the hash router on startup — don't override it with a page-path
    // guess. A bare "#/" is just the router's own empty state after re-basing
    // the URL, so the page-path guess still applies then.
    const hash = location.hash
    if (hash.length > 2 && hash.startsWith('#/')) return

    // `originalUrl` holds the URL as it was before the hash router re-based it.
    // parse() returns null for a URL it can't read, and we pass an empty
    // default language so an empty result means "the URL named no language"
    // rather than silently pinning the show to the built-in default.
    const parsed = SeriesUrl.parse(originalUrl, { language: '' })

    if (parsed?.title) {
        // parsed.title is already decoded, so it must be re-encoded before
        // being spliced into the path — otherwise a slug containing a '/'
        // would shift every following segment.
        let path = `/show/${encodeURIComponent(parsed.title)}/${parsed.season}`
        if (parsed.episode) path += `/${parsed.episode}`
        if (parsed.hosterExplicit && parsed.hoster) {
            path += `/${encodeURIComponent(parsed.hoster)}`
        }
        // The site's own URLs carry the language as a path segment; carry it
        // over so a deep link opens the dub that was actually linked.
        router.push({
            path,
            query: parsed.language ? { lang: parsed.language } : {},
        })
    }
})
</script>

<template>
    <div>
        <RouterView />
    </div>
</template>
