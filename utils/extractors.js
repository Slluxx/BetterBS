// Pure DOM -> data extractors. Each takes a parsed Document and returns plain
// JSON, so the results are cacheable and UI-independent.

import { resolve } from './scraper.js'
import { sanitizeHtml } from './sanitize.js'

const text = el => (el?.textContent ?? '').trim()
const attr = (el, name) => el?.getAttribute(name) ?? ''

// The site injects stray, empty "andere-serien" anchors into its carousels — in
// the newest-episodes list one lands as the FIRST <a> of the FIRST <li>, ahead
// of the real link. So "the first anchor in this <li>" is not reliably the show
// link, and picking it yields an empty title, no slug and a dead link. Prefer
// the anchor the site marks as the title, then any anchor pointing into
// /serie/, and only fall back to the first one.
function showLink(el) {
    if (!el) return null
    return el.querySelector('a.title')
        ?? el.querySelector('a[href*="serie/"]')
        ?? el.querySelector('a')
}

// The show slug is always the path segment right after /serie/,
// regardless of whether the href points at a show, a season or an episode.
function showSlug(href) {
    const parts = String(href).split('/').filter(Boolean)
    const idx = parts.indexOf('serie')
    return parts[idx + 1] ?? ''
}

// The show's numeric id lives in its cover image URL:
// .../public/images/cover/5254.jpg -> 5254. It's needed for the favorites API.
function coverId(src) {
    const m = String(src).match(/\/(\d+)\.(?:jpg|jpeg|png|webp)(?:\?.*)?$/i)
    return m ? Number(m[1]) : null
}

// The language is a path segment on the site's own episode URLs
// (/serie/<slug>/<season>/<episode>/<language>), so the real code ("de") can be
// read straight off the link instead of being guessed from the visible label
// ("Deutsch"). Returns '' when the URL carries no usable code, so callers can
// fall back rather than link to a language that doesn't exist.
function languageFromHref(href) {
    const parts = String(href).split('/').filter(Boolean)
    const idx = parts.indexOf('serie')
    if (idx === -1) return ''
    const code = parts[idx + 4] ?? ''
    return /^[a-z]{2,3}(-[a-z]{2,4})?$/i.test(code) ? code : ''
}

export function home(dom) {
    // Dropping entries without a slug also discards the stray "andere-serien"
    // anchors, which match `li > a` but aren't series links.
    const newestShows = [...dom.querySelectorAll('#newest_series > div > ul > li > a')]
        .map(a => ({
            title: text(a),
            slug: showSlug(attr(a, 'href')),
            href: resolve(attr(a, 'href')),
        }))
        .filter(s => s.slug)

    const newestEpisodes = [...dom.querySelectorAll('#newest_episodes > div > ul > li')].map(li => {
        const link = showLink(li)
        const match = text(li.querySelector('.info')).match(/S(\d+)\s*E(\d+)/i)
        const href = attr(link, 'href')
        return {
            title: text(link),
            slug: showSlug(href),
            href: resolve(href),
            season: match ? Number(match[1]) : null,
            episode: match ? Number(match[2]) : null,
            // The site's own human-readable label, shown on the tile.
            language: attr(li.querySelector('.info i'), 'title'),
            // The real code, so the tile's link can open the show in the dub
            // the site is advertising here. '' when the URL has no code.
            languageCode: languageFromHref(href),
        }
    }).filter(e => e.slug)

    const news = [...dom.querySelectorAll('#news > div > ul > li')].map(li => ({
        title: text(li.querySelector('.header > a')),
        time: text(li.querySelector('.header > time')),
        content: sanitizeHtml(li.querySelector('.content')?.innerHTML ?? ''),
    }))

    // The logged-in favorites list in the sidebar nav. Drop the trailing
    // "Serienvorschläge" link (it points outside /serie/).
    const favorites = [...dom.querySelectorAll('#other-series-nav > ul > li')]
        .map(li => {
            const a = showLink(li)
            return {
                title: text(a),
                slug: showSlug(attr(a, 'href')),
                href: resolve(attr(a, 'href')),
            }
        })
        .filter(f => f.slug && f.slug !== 'vorgeschlagene-serien')

    return { newestShows, newestEpisodes, news, favorites }
}

// The <select class="series-language"> block is PER SEASON, not per show.
//
// The show overview URL (/serie/<slug>) carries the languages of the site's
// default season, so a show that gains a dub later looks like it never had it:
// "Ascendance of a Bookworm" season 1 lists only `des`, while season 4 lists
// `de` and `des`. The season URL (/serie/<slug>/<season>[/<language>]) carries
// the authoritative list for that season, so this must be read per season
// rather than once per show.
//
// It is also the only trustworthy signal for what a language-specific URL
// actually returned. Asking for a language a season does not have does NOT
// fail: the site serves that season's default instead and answers 200. The
// `selected` option is that default, so it reports which dub really came back.
export function seasonLanguages(dom) {
    const select = dom.querySelector('.language select.series-language')
    const options = [...(select?.querySelectorAll('option') ?? [])]
    const languages = options
        .map(o => ({ code: attr(o, 'value'), label: text(o) }))
        .filter(l => l.code)
    // No `selected` attribute (or none matched) -> the first entry is the
    // default, which is how the site itself orders them.
    const selected = options.find(o => o.hasAttribute('selected'))?.getAttribute('value')
        ?? languages[0]?.code
        ?? ''
    return { languages, selected }
}

export function show(dom) {
    const left = dom.querySelector('#sp_left')

    const h2 = left?.querySelector('h2')?.cloneNode(true)
    h2?.querySelector('small')?.remove()

    const infoDivs = [...(left?.querySelectorAll('.infos > div') ?? [])]
    const info = {}
    for (const div of infoDivs) {
        const key = text(div.querySelector('span'))
        if (key) info[key] = text(div.querySelector('p'))
    }

    const genres = [...(infoDivs
        .find(div => text(div.querySelector('span')) === 'Genres')
        ?.querySelectorAll('p > span') ?? [])]
        .map(s => text(s))

    const seasons = [...dom.querySelectorAll('#seasons > ul > li')].map(li => {
        const n = Number((li.className.match(/s(\d+)/) ?? [])[1])
        return {
            number: n,
            label: text(li.querySelector('a')) || (n === 0 ? 'Specials' : String(n)),
            special: n === 0,
            // The site marks fully-watched seasons with a `.watched` class.
            watched: li.classList.contains('watched'),
        }
    })

    // Same parser as the season pages, so the two can't drift. On the overview
    // URL this reflects the site's default season only — it is a fallback for
    // before a season page has been fetched, not the per-season truth.
    const { languages } = seasonLanguages(dom)

    const cover = dom.querySelector('#sp_right img[alt="Cover"]')
    const coverSrc = cover ? attr(cover, 'src') : ''

    return {
        title: text(h2),
        description: text(left?.querySelector('p')),
        info,
        genres,
        id: coverId(coverSrc),
        cover: coverSrc ? resolve(coverSrc) : '',
        seasons,
        languages,
    }
}

export function episodes(dom) {
    return [...dom.querySelectorAll('table.episodes tr')]
        .map(tr => {
            const link = tr.querySelector('td:first-child a')
            const mark = tr.querySelector('a[href*="watch:"]')
            return {
                number: Number(text(link)),
                title: attr(link, 'title') || text(link),
                href: resolve(attr(link, 'href')),
                hosters: [...tr.querySelectorAll('td:nth-child(3) a')].map(a => attr(a, 'title')),
                watched: tr.classList.contains('watched'),
                // The row exists in this language but has nothing to play: the
                // site lists an episode row with `class="disabled"` and an empty
                // hoster cell until that language's release catches up. Coverage
                // is therefore per EPISODE, not per season — a season can offer
                // two languages while the newer episodes exist in only one of
                // them (Yani Neko S1 has 1-9 in `de` but needs 10-12 from `des`).
                // An empty hoster cell is checked too, so a row the site forgets
                // to disable still isn't treated as playable.
                disabled: tr.classList.contains('disabled')
                    || tr.querySelectorAll('td:nth-child(3) a').length === 0,
                // Link that marks the episode as watched (or unwatched) server-side.
                markHref: mark ? resolve(attr(mark, 'href')) : '',
            }
        })
        .filter(e => e.number)
}

export function allShows(dom) {
    return [...dom.querySelectorAll('.genre > ul > li > a')]
        .map(a => ({
            title: attr(a, 'title') || text(a),
            slug: showSlug(attr(a, 'href')),
            href: resolve(attr(a, 'href')),
        }))
        .filter(s => s.slug)
}

export function securityToken(dom) {
    return attr(dom.querySelector('meta[name="security_token"]'), 'content')
}

export function cover(dom) {
    const img = dom.querySelector('#sp_right img[alt="Cover"]')
    if (!img) return { url: '', id: null }
    const src = attr(img, 'src')
    return { url: resolve(src), id: coverId(src) }
}
