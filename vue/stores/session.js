import { defineStore } from 'pinia'
import { BASE } from '@/utils/scraper.js'
import { get, set, remove, hydrate } from '@/utils/storage.js'
import { useSiteStore } from './site'

const USERNAME_KEY = 'bs_username'

// Reads the actual login form on /login.php instead of assuming field names:
// the markup changes over time, so each input is located by its name/type and
// the discovered names are used for the POST.
function parseLoginForm(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const form = doc.querySelector('form#login')
    if (!form) return null

    const inputs = [...form.querySelectorAll('input')]
    const find = (re) => inputs.find((i) => re.test(i.name))
    const username = find(/user|name/i) || inputs.find((i) => i.type === 'text')
    const password = find(/pass/i) || inputs.find((i) => i.type === 'password')
    const token = find(/security_token|csrf|_token/i)
    const remember = inputs.find((i) => i.type === 'checkbox')

    return {
        action: new URL(form.getAttribute('action') || '/login.php', BASE).href,
        usernameName: username?.name || 'username',
        passwordName: password?.name || 'password',
        tokenName: token?.name || 'security_token',
        tokenValue: token?.value || '',
        rememberName: remember?.name || '',
    }
}

function isLoginPage(url) {
    return /login/i.test(new URL(url).pathname)
}

// The session cookie (`id`) is visible to document.cookie and is the source
// of truth for login state.
function hasSessionCookie() {
    return document.cookie.split('; ').some(cookie => cookie.startsWith('id='))
}

// Force-expire the session cookie from the client. Used as a fallback when the
// server logout doesn't clear it. Tries the common domain/path combinations
// since we can't read the cookie's attributes.
function clearSessionCookie() {
    const host = location.hostname
    const paths = [location.pathname, '/']
    const domains = [host, `.${host}`]
    for (const path of paths) {
        for (const domain of domains) {
            document.cookie = `id=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}; domain=${domain}`
            document.cookie = `id=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}`
        }
    }
}

function loginError(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const el = doc.querySelector('.error, .alert, .login_error, .login-error, #login .error')
    return el?.textContent?.trim() || ''
}

export const useSessionStore = defineStore('session', {
    state: () => ({
        loggedIn: false,
        username: '',
        error: '',
        busy: false,
        loginModalOpen: false,
    }),

    actions: {
        async hydrate() {
            this.username = await hydrate(USERNAME_KEY, '')
        },

        openLogin() {
            this.loginModalOpen = true
        },

        closeLogin() {
            this.loginModalOpen = false
        },

        checkLoginCookie() {
            if (hasSessionCookie()) {
                this.loggedIn = true
                if (!this.username) {
                    this.username = get(USERNAME_KEY, '')
                }
            }
        },

        async login(username, password, remember = false) {
            this.busy = true
            this.error = ''
            try {
                const pageRes = await fetch(`${BASE}/login.php`, { credentials: 'same-origin' })
                if (!pageRes.ok) throw new Error(`HTTP ${pageRes.status} â€” /login.php`)

                const form = parseLoginForm(await pageRes.text())
                if (!form) throw new Error('Login-Formular nicht gefunden.')

                const body = new URLSearchParams()
                body.set(form.usernameName, username)
                body.set(form.passwordName, password)
                if (form.tokenValue) body.set(form.tokenName, form.tokenValue)
                if (remember && form.rememberName) body.set(form.rememberName, 'true')

                const res = await fetch(form.action, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body,
                    redirect: 'follow',
                })
                const html = await res.text()

                // A successful login redirects away from /login.php; a failed
                // one re-renders it (200) with an error message. Some responses
                // answer 200 on /login.php even when logging in (the page then
                // no longer contains the login form), so judge by the final
                // page's content rather than the URL alone.
                const ok = res.ok && (!isLoginPage(res.url) || !parseLoginForm(html))
                if (ok) {
                    this.loggedIn = true
                    this.username = username
                    set(USERNAME_KEY, username)
                    this.checkLoginCookie()
                    // The nav switched from the guest/demo favorites to the
                    // account's favorites — re-scrape it right away so the
                    // carousel updates without a manual reload.
                    useSiteStore().refreshFavorites()
                } else {
                    this.error = loginError(html)
                        || 'Login fehlgeschlagen. Benutzername oder Passwort falsch.'
                }
                return ok
            } catch (e) {
                this.error = e?.message || String(e)
                return false
            } finally {
                this.busy = false
            }
        },

        async logout() {
            // Server-side logout first (the real endpoint is /logout, some
            // versions use /logout.php), then force-expire the cookie
            // client-side in case the server didn't clear it.
            for (const path of ['/logout', '/logout.php']) {
                try {
                    await fetch(`${BASE}${path}`, { credentials: 'same-origin', redirect: 'follow' })
                } catch { /* ignore */ }
            }
            clearSessionCookie()

            if (hasSessionCookie()) {
                // The server session is still alive â€” restore the account
                // display instead of leaving a bare "Account" state.
                this.loggedIn = true
                this.username = this.username || get(USERNAME_KEY, '')
                return
            }

            this.loggedIn = false
            this.username = ''
            remove(USERNAME_KEY)
            // The nav switched back to the guest/demo favorites — refresh the
            // carousel without a manual reload.
            useSiteStore().refreshFavorites()
        },

        // Detect an existing session (e.g. after a reload) by fetching the
        // login page: a logged-in user is redirected away from it.
        async restoreSession() {
            if (this.loggedIn) return
            try {
                const res = await fetch(`${BASE}/login.php`, { credentials: 'same-origin', redirect: 'follow' })
                if (res.ok) {
                    const html = await res.text()
                    const loggedIn = !isLoginPage(res.url) || !parseLoginForm(html)
                    if (loggedIn) {
                        this.loggedIn = true
                        this.username = get(USERNAME_KEY, '')
                    }
                }
            } catch { /* ignore */ }
        },
    },
})
