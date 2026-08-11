// Background fetch + cache layer for scraping BurningSeries pages.
//
// Everything runs here so the user never navigates: pages are fetched in the
// background and parsed with DOMParser, then handed to the extractors.

const DEFAULT_TTL = 5 * 60 * 1000
const MAX_CACHE_ENTRIES = 40

// When the user is already on a BurningSeries domain, scrape same-origin so
// cookies and any region/language settings apply. Otherwise use the default.
const isBsOrigin = /(^|\.)(bs\.|burningseries\.)/.test(location.hostname)
const BASE = isBsOrigin ? location.origin : 'https://burningseries.ac'

// Simple LRU so a long session (many shows/seasons/languages) never grows
// unbounded: on insert, the least-recently-used entry is dropped once the cap
// is reached.
const cache = new Map() // url -> { at, dom }
const inflight = new Map() // url -> Promise (dedupe concurrent requests)

function cacheGet(url) {
    const hit = cache.get(url)
    if (hit) {
        // Refresh recency: delete + re-set moves the entry to the tail.
        cache.delete(url)
        cache.set(url, hit)
    }
    return hit
}

function cacheSet(url, value) {
    if (cache.has(url)) cache.delete(url)
    cache.set(url, value)
    if (cache.size > MAX_CACHE_ENTRIES) {
        const oldest = cache.keys().next().value
        cache.delete(oldest)
    }
}

function resolve(href) {
    if (!href) return ''
    const u = new URL(href, BASE)
    if (u.protocol === 'http:') u.protocol = 'https:'
    return u.href
}

async function fetchText(url) {
    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(`HTTP ${response.status} — ${url}`)
    }
    return response.text()
}

async function fetchDom(url, { ttl = DEFAULT_TTL, force = false } = {}) {
    const hit = cacheGet(url)
    if (hit && !force && Date.now() - hit.at < ttl) {
        return hit.dom
    }

    // Reuse an in-flight request so two loads of the same page share one fetch.
    if (inflight.has(url)) {
        return inflight.get(url)
    }

    const pending = (async () => {
        const html = await fetchText(url)
        const dom = new DOMParser().parseFromString(html, 'text/html')
        cacheSet(url, { at: Date.now(), dom })
        return dom
    })().finally(() => inflight.delete(url))

    inflight.set(url, pending)
    return pending
}

async function scrape(url, extract, opts) {
    const dom = await fetchDom(url, opts)
    return extract(dom)
}

export { BASE, DEFAULT_TTL, resolve, fetchText, fetchDom, scrape }
export default { BASE, DEFAULT_TTL, resolve, fetchText, fetchDom, scrape }
