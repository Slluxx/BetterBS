// Pure DOM -> data extractors. Each takes a parsed Document and returns plain
// JSON, so the results are cacheable and UI-independent.

import { resolve } from './scraper.js'
import { sanitizeHtml } from './sanitize.js'

const text = el => (el?.textContent ?? '').trim()
const attr = (el, name) => el?.getAttribute(name) ?? ''

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

export function home(dom) {
    const newestShows = [...dom.querySelectorAll('#newest_series > div > ul > li > a')].map(a => ({
        title: text(a),
        slug: showSlug(attr(a, 'href')),
        href: resolve(attr(a, 'href')),
    }))

    const newestEpisodes = [...dom.querySelectorAll('#newest_episodes > div > ul > li')].map(li => {
        const link = li.querySelector('a')
        const match = text(li.querySelector('.info')).match(/S(\d+)\s*E(\d+)/i)
        return {
            title: text(link),
            slug: showSlug(attr(link, 'href')),
            href: resolve(attr(link, 'href')),
            season: match ? Number(match[1]) : null,
            episode: match ? Number(match[2]) : null,
            language: attr(li.querySelector('.info i'), 'title'),
        }
    })

    const news = [...dom.querySelectorAll('#news > div > ul > li')].map(li => ({
        title: text(li.querySelector('.header > a')),
        time: text(li.querySelector('.header > time')),
        content: sanitizeHtml(li.querySelector('.content')?.innerHTML ?? ''),
    }))

    // The logged-in favorites list in the sidebar nav. Drop the trailing
    // "Serienvorschläge" link (it points outside /serie/).
    const favorites = [...dom.querySelectorAll('#other-series-nav > ul > li')]
        .map(li => {
            const a = li.querySelector('a')
            return {
                title: text(a),
                slug: showSlug(attr(a, 'href')),
                href: resolve(attr(a, 'href')),
            }
        })
        .filter(f => f.slug && f.slug !== 'vorgeschlagene-serien')

    return { newestShows, newestEpisodes, news, favorites }
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

    const languages = [...dom.querySelectorAll('.language select.series-language option')].map(o => ({
        code: attr(o, 'value'),
        label: text(o),
    }))

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
                // Link that marks the episode as watched (or unwatched) server-side.
                markHref: mark ? resolve(attr(mark, 'href')) : '',
            }
        })
        .filter(e => e.number)
}

export function allShows(dom) {
    return [...dom.querySelectorAll('.genre > ul > li > a')].map(a => ({
        title: attr(a, 'title') || text(a),
        slug: showSlug(attr(a, 'href')),
        href: resolve(attr(a, 'href')),
    }))
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
