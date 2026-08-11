// Resolves a stream by POSTing to the player page's ajax/embed.php after
// passing the invisible reCAPTCHA.
//
// The reCAPTCHA interaction MUST happen in the page's main world: content
// script isolated worlds cannot see `grecaptcha` (which is why running this
// code as a userscript used to work but not from the extension). Pages also
// block inline <script> injection via CSP, so the challenge code runs through
// chrome.scripting.executeScript (world: MAIN) from the background script,
// which is immune to page CSP.
//
// The extension's own overlay sits at z-index 1147483647 and would swallow
// clicks meant for Google's challenge iframe, so a stylesheet forces every
// recaptcha iframe above it, and the widget is hosted in a full-screen layer
// that is pointer-events-transparent (only the widget area is interactive).
// The layer is removed again once the challenge settles so it never blocks
// the extension UI.
//
// Note: reCAPTCHA tickets are bound to the domain the widget is rendered on.
// The overlay renders on the current page, so the ticket is only valid when
// that page is on a BurningSeries domain.

import { log, warn, error } from './log.js'

// All in-flight challenge layers, keyed by container id. Each load() gets its
// own layer so two concurrent requests (rapid episode/hoster switching) do not
// tear down each other's widget. The element carrying the id is the EMPTY
// placeholder div the widget renders into — reCAPTCHA refuses non-empty ones.
const activeLayers = new Map()

class StreamLoader {
    static async load(url) {
        const base = new URL(url).origin;
        log('[StreamLoader] resolving stream for', url);
        const dom = await this.fetchDom(url);
        const data = this.extractData(dom);
        log('[StreamLoader] player data', { csrf: !!data.csrf, lid: data.lid, siteKey: data.siteKey });

        if (!data.csrf || !data.lid || !data.siteKey) {
            throw new Error("Missing csrf/lid/sitekey");
        }

        log('[StreamLoader] starting reCAPTCHA challenge');
        const ticket = await this.runChallenge(data.siteKey);
        log('[StreamLoader] reCAPTCHA ticket received');

        const result = await this.fetchStream(base, data, ticket);
        log('[StreamLoader] stream result', result);
        return result;
    }

    static async fetchDom(url) {
        log('[StreamLoader] fetching player page', url);
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to load player page (${response.status})`);
        }

        const html = await response.text();
        log('[StreamLoader] player page loaded', html.length, 'bytes');
        const parser = new DOMParser();
        return parser.parseFromString(html, "text/html");
    }

    static extractData(dom) {
        const player = dom.querySelector(".hoster-player");

        if (!player) {
            throw new Error(".hoster-player missing");
        }

        const inlineScripts = [...dom.scripts]
            .filter(s => !s.src)
            .map(s => s.textContent)
            .join("\n");

        const siteKeyMatch = inlineScripts.match(/6L[A-Za-z0-9_-]{38}/);

        return {
            csrf: dom.querySelector('meta[name="security_token"]')?.content,
            lid: player.dataset.lid,
            siteKey: siteKeyMatch?.[0]
        };
    }

    static injectStyles() {
        if (document.getElementById("bs-recaptcha-styles")) return;

        const style = document.createElement("style");
        style.id = "bs-recaptcha-styles";
        style.textContent = `
            .grecaptcha-badge,
            iframe[src*="google.com/recaptcha"] {
                z-index: 2147483647 !important;
            }
        `;
        document.head.appendChild(style);
    }

    static ensureLayer(containerId) {
        this.injectStyles();
        if (activeLayers.has(containerId)) return;

        const layer = document.createElement("div");

        Object.assign(layer.style, {
            position: "fixed",
            inset: "0",
            width: "100vw",
            height: "100vh",
            zIndex: "2147483647",
            pointerEvents: "none",
            isolation: "isolate"
        });

        // The widget's placeholder. Must stay empty (reCAPTCHA throws
        // "placeholder element must be empty" otherwise) and must be findable
        // by id from the page's MAIN world.
        const container = document.createElement("div");
        container.id = containerId;

        Object.assign(container.style, {
            position: "fixed",
            bottom: "0",
            right: "0",
            zIndex: "2147483647",
            pointerEvents: "auto"
        });

        layer.appendChild(container);
        document.body.appendChild(layer);

        activeLayers.set(containerId, layer);
    }

    static removeLayer(containerId) {
        const layer = activeLayers.get(containerId);
        if (layer) layer.remove();
        activeLayers.delete(containerId);
    }

    static runChallenge(siteKey) {
        const id = `challenge-${Date.now()}-${Math.random().toString(36).slice(2)}`;

        this.ensureLayer(id);

        return new Promise((resolve, reject) => {
            let settled = false;

            const finish = (fn, value) => {
                if (settled) return
                settled = true
                clearTimeout(timeout)
                this.removeLayer(id)
                fn(value)
            }

            const timeout = setTimeout(() => {
                warn('[StreamLoader] reCAPTCHA challenge timed out');
                finish(reject, new Error("reCAPTCHA challenge timed out"))
            }, 120000)

            // The challenge runs in the page's MAIN world via the background
            // script (chrome.scripting.executeScript), which is not subject to
            // the page's CSP.
            browser.runtime.sendMessage({ type: "BS_RUN_CHALLENGE", siteKey, containerId: id })
                .then((res) => {
                    if (res?.ticket) {
                        log('[StreamLoader] challenge resolved');
                        finish(resolve, res.ticket)
                    } else {
                        warn('[StreamLoader] challenge failed', res?.error);
                        finish(reject, new Error(res?.error || "reCAPTCHA challenge failed"))
                    }
                })
                .catch((e) => {
                    warn('[StreamLoader] challenge error', e);
                    finish(reject, new Error(e?.message || "Failed to run reCAPTCHA challenge"))
                })
        })
    }

    static async fetchStream(base, data, ticket) {
        const url = `${base}/ajax/embed.php`;
        log('[StreamLoader] POST', url, { LID: data.lid });
        const response = await fetch(url, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: new URLSearchParams({
                token: data.csrf,
                LID: data.lid,
                ticket
            })
        });

        let json;
        try {
            json = await response.json();
        } catch {
            throw new Error(`embed.php returned non-JSON (${response.status})`);
        }

        if (!json.success) {
            warn('[StreamLoader] embed.php failed', json);
            throw new Error("Stream request failed");
        }

        log('[StreamLoader] embed.php success', { embed: json.embed, link: json.link });
        return json;
    }
}

export default StreamLoader;
