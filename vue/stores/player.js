import { defineStore } from 'pinia'
import StreamLoader from '@/utils/Streamloader.js'
import { toEmbedUrl } from '@/utils/embed.js'

// Hoster players sometimes hand back http:// stream links; the iframe lives on
// an https page, so such links would be blocked as mixed content.
function forceHttps(url) {
    if (!url) return url
    try {
        const u = new URL(url)
        if (u.protocol === 'http:') {
            u.protocol = 'https:'
            return u.href
        }
    } catch {
        // keep the original value
    }
    return url
}

export const usePlayerStore = defineStore('player', {
    state: () => ({
        loading: false,
        error: null,
        result: null,
        embedUrl: null,
        hoster: 'Doodstream',
    }),

    actions: {
        async loadStream({ url, hoster }) {
            const id = ++requestId
            console.log('[player] loadStream', { url, hoster })
            this.loading = true
            this.error = null
            this.result = null
            this.embedUrl = null
            // Reflect the selected hoster immediately; otherwise the previous
            // hoster keeps showing while a slow reCAPTCHA challenge runs.
            this.hoster = hoster

            try {
                const playerUrl = new URL(`${url}/${hoster}`).href
                console.log('[player] player page URL', playerUrl)
                const result = await StreamLoader.load(playerUrl)
                if (id !== requestId) {
                    console.log('[player] result superseded by a newer request')
                    return
                }
                const link = forceHttps(result?.link)
                this.result = { ...result, link }
                this.embedUrl = result?.embed === '1' ? link : toEmbedUrl(link)
                if (this.embedUrl) {
                    console.log('[player] embeddable link', this.embedUrl)
                } else {
                    console.log('[player] link cannot be embedded, offering open-in-new-tab', link)
                }
                console.log('[player] stream ready', { ...result, link })
            } catch (e) {
                if (id !== requestId) return
                this.error = e?.message || String(e)
                console.error('[player] stream failed:', this.error)
            } finally {
                if (id === requestId) this.loading = false
            }
        },
    },
})

// Monotonic id so an in-flight challenge is superseded when the user switches
// episodes/hosters before it resolves.
let requestId = 0
