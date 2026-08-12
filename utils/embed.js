// Converts a hoster's watch/play URL into an iframe-embeddable URL.
//
// The site's `embed.php` response only says whether its default player can be
// embedded (`embed === "1"`). When it can't, the returned link is usually the
// hoster's *watch* page, which most hosters let you embed with a small path
// change (e.g. /d/ -> /e/).
//
// toEmbedUrl(url) returns the URL to put in an <iframe>:
//   - the transformed embed URL, if the watch URL needs a path change
//   - the URL unchanged, if it is already in embed form
//   - null, if the hoster has no rule (caller falls back to "open in new tab")

function withPath(url, transform, targetHost) {
    try {
        const u = new URL(url)
        const next = transform(u.pathname)
        if (!next) return null
        if (next !== u.pathname) u.pathname = next
        if (targetHost) u.host = targetHost
        return u.href
    } catch {
        return null
    }
}

const RULES = [
    {
        name: 'voe',
        host: /(^|\.)voe\.sx$/i,
        path: (p) => p.replace(/^\/(?!e\/)/i, '/e/'),
    },
    {
        name: 'doodstream',
        host: /d000d|doodstream|dooodstream|dood\.|do0od|do7go/i,
        path: (p) => p.replace(/^\/d\//, '/e/'),
    },
    {
        name: 'vidmoly',
        host: /vidmoly/i,
        targetHost: 'vidmoly.org',
        path: (p) => {
            if (/^\/embed-/.test(p)) return p
            const id = p.replace(/^\/[a-z]\//, '').replace(/\.html$/, '')
            return `/embed-${id}.html`
        },
    },
    {
        name: 'filemoon',
        host: /filemoon/i,
        path: (p) => p.replace(/^\/(?:d|v)\//, '/e/'),
    },
    {
        name: 'streamtape',
        host: /streamtape/i,
        path: (p) => p.replace(/^\/v\//, '/e/'),
    },
    {
        name: 'vidoza',
        host: /vidoza/i,
        path: (p) => {
            if (/^\/embed-/.test(p)) return p
            return p.replace(/([^/]+\.html)$/, 'embed-$1')
        },
    },
    {
        name: 'sendvid',
        host: /sendvid/i,
        path: (p) => {
            if (/^\/embed\//.test(p)) return p
            return `/embed${p}`
        },
    },
    {
        name: 'file-hosts',
        host: /streamwish|filelions|streamhub|embedwish|mystream|streamz|streamvid|japstream/i,
        path: (p) => p.replace(/^\/f\//, '/e/'),
    },
    // Doodstream (and family) rotate their hostnames constantly while keeping
    // the same URL structure. This structure-based rule catches any new domain
    // that uses their signature /d/<id> layout. Known hosters above take
    // precedence; this only fires for hosts with no specific rule.
    {
        name: 'doodstream-like (/d/ path)',
        host: /./,
        path: (p) => {
            const m = p.match(/^\/d\/([a-z0-9]+)$/i)
            if (m) return `/e/${m[1]}`
            return /^\/e\/[a-z0-9]+$/i.test(p) ? p : null
        },
    },
]

export function toEmbedUrl(url) {
    if (!url) return null

    let u
    try {
        u = new URL(url)
    } catch {
        return null
    }

    // Never embed over http — the iframe lives on an https page.
    if (u.protocol === 'http:') u.protocol = 'https:'
    const normalized = u.href

    const rule = RULES.find((r) => r.host.test(u.host))
    if (!rule) {
        console.log('[embed] no embed rule for hoster', u.host)
        return null
    }

    const result = withPath(normalized, rule.path, rule.targetHost)
    console.log(`[embed] ${rule.name}: ${normalized} -> ${result ?? '(cannot embed — open in new tab)'}`)
    return result
}
