// Minimal whitelist-based sanitizer for scraped HTML (news posts).
//
// Scripts, event-handler attributes and unsafe URLs are removed entirely;
// unknown tags are unwrapped so their text content is preserved. Parsing
// happens through DOMParser, so no scripts can execute during sanitization.

const ALLOWED_TAGS = new Set([
    'a', 'b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li',
    'img', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'u', 's', 'span',
    'div', 'small', 'sub', 'sup', 'hr',
])

const ALLOWED_ATTRS = {
    a: new Set(['href', 'title']),
    img: new Set(['src', 'alt', 'title', 'width', 'height']),
}

const DROP_TAGS = new Set([
    'script', 'style', 'iframe', 'object', 'embed', 'form', 'input',
    'button', 'select', 'textarea', 'link', 'meta', 'svg', 'video',
    'audio', 'source', 'track', 'canvas',
])

const SAFE_HREF = /^(https?:|mailto:|#)/i

export function sanitizeHtml(html) {
    if (!html) return ''

    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
    const body = doc.body

    // Static snapshot: unwrapping moves nodes, but every descendant is
    // already part of this list, so each is still visited exactly once.
    for (const el of [...body.querySelectorAll('*')]) {
        const tag = el.tagName.toLowerCase()

        if (DROP_TAGS.has(tag)) {
            el.remove()
            continue
        }

        if (!ALLOWED_TAGS.has(tag)) {
            // Unwrap: keep the children, drop the element itself.
            el.replaceWith(...el.childNodes)
            continue
        }

        const allowed = ALLOWED_ATTRS[tag] ?? new Set()
        for (const attr of [...el.attributes]) {
            const name = attr.name.toLowerCase()
            if (name.startsWith('on') || !allowed.has(name)) {
                el.removeAttribute(attr.name)
                continue
            }
            if (name === 'href' && !SAFE_HREF.test(attr.value.trim())) {
                el.removeAttribute('href')
            }
        }
    }

    return body.innerHTML
}
