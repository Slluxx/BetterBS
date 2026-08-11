export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== 'BS_RUN_CHALLENGE') return

    const tabId = sender.tab?.id
    if (tabId == null) {
      sendResponse({ error: 'No tab id' })
      return
    }

    console.log('[background] BS_RUN_CHALLENGE', { tabId, containerId: message.containerId })

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
        console.log('[background] challenge resolved', result?.result ? '(ticket)' : result?.result)
        sendResponse({ ticket: result?.result ?? null })
      })
      .catch((err) => {
        console.error('[background] challenge executeScript failed', err)
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
    console.log('[recaptcha] rendering challenge in main world', containerId)
    const timeout = setTimeout(() => {
      console.warn('[recaptcha] challenge timed out')
      reject(new Error('reCAPTCHA challenge timed out'))
    }, 120000)

    window.grecaptcha.ready(() => {
      const container = document.getElementById(containerId) ?? document.body
      const widget = window.grecaptcha.render(container, {
        sitekey: siteKey,
        size: 'invisible',
        callback: (ticket: string) => {
          clearTimeout(timeout)
          console.log('[recaptcha] ticket obtained')
          resolve(ticket)
        },
      })
      window.grecaptcha.execute(widget)
    })
  })
}
