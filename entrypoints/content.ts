// Must be first: captures the pristine URL before the router rewrites it.
import '@/utils/originalUrl'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from '@/vue/pages/App.vue'
import router from '@/vue/router'
import { useHistoryStore } from '@/vue/stores/history'
import { useSettingsStore } from '@/vue/stores/settings'
import { useFavoritesStore } from '@/vue/stores/favorites'
import { useSessionStore } from '@/vue/stores/session'
import { useNotificationsStore } from '@/vue/stores/notifications'
import mainCss from '@/assets/main.css?inline'
import carouselCss from 'vue3-carousel/carousel.css?inline'

// Only run on the official Burning Series domains (the site lists these
// mirrors; bs.to is kept for historical access).
const BS_MATCHES = [
  '*://burningseries.ac/*', '*://*.burningseries.ac/*',
  '*://burningseries.cx/*', '*://*.burningseries.cx/*',
  '*://burningseries.co/*', '*://*.burningseries.co/*',
  '*://burningseries.sx/*', '*://*.burningseries.sx/*',
  '*://burningseries.vc/*', '*://*.burningseries.vc/*',
  '*://burningseries.nz/*', '*://*.burningseries.nz/*',
  '*://burningseries.se/*', '*://*.burningseries.se/*',
  '*://bs.to/*', '*://*.bs.to/*',
  '*://bs.cine.to/*', '*://*.bs.cine.to/*',
]

export default defineContentScript({
  matches: BS_MATCHES,

  runAt: 'document_idle',

  main() {
    console.log('EXTENSION INJECT')

    // ---- TEMP DIAGNOSTIC: fullscreen debugging. Remove after fixing. ----
    console.log('[fs] top document.fullscreenEnabled =', document.fullscreenEnabled)
    document.addEventListener('fullscreenchange', () => {
      console.log('[fs] fullscreenchange', { fullscreenElement: document.fullscreenElement })
    })
    document.addEventListener('fullscreenerror', (e) => {
      console.log('[fs] fullscreenerror', e)
    })
    // ---- END TEMP DIAGNOSTIC ----

    const start = async () => {
      // Prevent duplicate injection
      if (document.getElementById('my-extension-host')) {
        return
      }

      const host = document.createElement('div')
      host.id = 'my-extension-host'

      document.body.appendChild(host)

      const shadow = host.attachShadow({ mode: 'open' })

      const root = document.createElement('div')
      root.id = 'app'

      shadow.appendChild(root)

      Object.assign(host.style, {
        position: 'fixed',
        inset: '0',
        width: '100vw',
        height: '100vh',
        overflowY: 'auto',
        zIndex: '1147483647',
      })

      // Hide original page content
      Array.from(document.body.children).forEach((el) => {
        if (el !== host) {
          ; (el as HTMLElement).style.display = 'none'
        }
      })

      // Inject the compiled app styles into the shadow root.
      // Note: document-level styles don't reach shadow DOM, so the <style>
      // must live inside the shadow root. `:root` also never matches inside
      // a shadow tree, so theme variables are re-targeted to `:host`.
      const style = document.createElement('style')
      style.textContent = [mainCss, carouselCss].join('\n').replace(/:root\b/g, ':host')
      shadow.appendChild(style)

      // The app host is the scroll container (fixed, 100vh). Styling the
      // scrollbar forces Chromium to draw a persistent classic scrollbar
      // instead of the auto-hiding overlay one.
      const docStyle = document.createElement('style')
      docStyle.textContent = `
        #my-extension-host {
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, .35) transparent;
        }
        #my-extension-host::-webkit-scrollbar { width: 10px; }
        #my-extension-host::-webkit-scrollbar-track { background: transparent; }
        #my-extension-host::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, .3);
          border-radius: 5px;
        }
      `
      document.head.appendChild(docStyle)

      // Create Vue app
      const app = createApp(App)

      // Add global state
      const pinia = createPinia()
      app.use(pinia)
      app.use(router)

      // Load extension-wide storage (shared across all mirror domains) before
      // first paint so the UI renders with the persisted data.
      const favoritesStore = useFavoritesStore(pinia)
      await Promise.all([
        useSettingsStore(pinia).hydrate(),
        favoritesStore.hydrate(),
        useHistoryStore(pinia).init(),
        useSessionStore(pinia).hydrate(),
        useNotificationsStore(pinia).hydrate(),
      ])

      // Diagnostic: shows what actually survived the reload.
      console.log('[BetterBS] restored favorites ids:', favoritesStore.ids)
      console.log('[BetterBS] restored history items:', useHistoryStore(pinia).items.length)

      // Diagnostic: compare the two storage backends for the history key so we
      // can see which one hydrate() actually read from.
      try {
        const rawLocal = localStorage.getItem('recentlyVisited')
        const extApi = (globalThis as any).browser ?? (globalThis as any).chrome
        const rawExt = await extApi?.storage.local.get('recentlyVisited')
        console.log('[BetterBS] history sources — localStorage:', rawLocal, '| extension storage:', JSON.stringify(rawExt))
      } catch (e) {
        console.log('[BetterBS] history sources diagnostic failed:', e)
      }

      app.mount(root)
    }

    if (document.body) {
      start()
    } else {
      document.addEventListener('DOMContentLoaded', start, { once: true })
    }
  },
})
