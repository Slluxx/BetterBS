import { log, warn, error } from '@/utils/log.js'

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'BS_RUN_CHALLENGE') return

    const tabId = sender.tab?.id
    if (tabId == null) {
      sendResponse({ error: 'No tab id' })
      return
    }

    log('[background] BS_RUN_CHALLENGE', { tabId, containerId: message.containerId })

    browser.scripting
      .executeScript({
        target: { tabId },
        // Page CSP blocks inline <script> injection, so the reCAPTCHA code is
        // executed in the page's MAIN world instead. This also lets it see
        // `grecaptcha`, which isolated worlds cannot.
        world: 'MAIN',
        func: runRecaptchaChallenge,
        args: [message.siteKey, message.containerId],
      })
      .then(([result]) => {
        const ticket = result?.result
        if (ticket) {
          log('[background] challenge resolved (ticket)')
          sendResponse({ ticket })
          return
        }
        // The challenge finished but produced no token. reCAPTCHA calls the
        // callback with an EMPTY STRING when it declines to issue one — most
        // often because the sitekey is not authorized for this domain, or the
        // request looks automated enough that it is refused. Reporting that
        // plainly beats a bare "challenge failed", which told the user nothing.
        error('[background] challenge returned no ticket', result)
        sendResponse({
          error: 'reCAPTCHA returned no ticket (the site refused the challenge)'
            + ' — the site may be rate-limiting this client',
        })
      })

      .catch((err) => {
        error('[background] challenge executeScript failed', err)
        sendResponse({ error: err?.message ?? String(err) })
      })

    return true
  })
})

declare global {
  interface Window {
    grecaptcha: {
      ready(callback: () => void): void
      render(container: HTMLElement, parameters: Record<string, unknown>): number
      execute(widgetId: number): void
    }
  }
}

// Serialized and injected into the page. Must stay self-contained (no
// closures / outer scope references).
async function runRecaptchaChallenge(siteKey: string, containerId: string) {
  await new Promise<void>((resolve, reject) => {
    if (window.grecaptcha) {
      resolve()
      return
    }
    const existing = document.querySelector('script[src*="recaptcha/api.js"]')
    if (existing) {
      if (window.grecaptcha) {
        resolve()
        return
      }
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('reCAPTCHA api.js failed to load')), { once: true })
      return
    }
    const script = document.createElement('script')
    script.src = 'https://www.google.com/recaptcha/api.js?render=explicit'
    script.async = true
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error('reCAPTCHA api.js failed to load')), { once: true })
    document.head.appendChild(script)
  })

  return new Promise<string>((resolve, reject) => {
    log('[recaptcha] rendering challenge in main world', containerId)
    const timeout = setTimeout(() => {
      warn('[recaptcha] challenge timed out')
      reject(new Error('reCAPTCHA challenge timed out'))
    }, 120000)

    window.grecaptcha.ready(() => {
      const container = document.getElementById(containerId) ?? document.body
      const widget = window.grecaptcha.render(container, {
        sitekey: siteKey,
        size: 'invisible',
        callback: (ticket: string) => {
          clearTimeout(timeout)
          // reCAPTCHA invokes this with an EMPTY STRING when it declines to
          // issue a token. Resolving with it would look like success all the way
          // down to a generic "challenge failed", so name the real cause here.
          if (!ticket) {
            error('[recaptcha] callback returned an empty token')
            reject(new Error('reCAPTCHA issued an empty token (challenge refused)'))
            return
          }
          log('[recaptcha] ticket obtained')
          resolve(ticket)
        },
        // Not part of the v3 API, but honoured when present: it turns a
        // challenge-side error into a message instead of a 2-minute timeout.
        'error-callback': () => {
          clearTimeout(timeout)
          error('[recaptcha] error-callback fired')
          reject(new Error('reCAPTCHA reported an error while solving the challenge'))
        },
      })
      window.grecaptcha.execute(widget)
    })

  })
}
