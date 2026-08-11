import { createWebHashHistory, createRouter } from 'vue-router'

import Home from '@/vue/pages/Home.vue'
import Show from '@/vue/pages/Show.vue'

const routes = [
    { path: '/', component: Home },
    { path: '/show/:title/:season?/:episode?/:hoster?', component: Show },
]

const router = createRouter({
    // Hash history so the current app location is reflected in the page URL
    // (e.g. https://burningseries.ac/#/show/Supernatural/1/2) and can be
    // shared/reloaded. The explicit '/' base is required: sites like burning
    // series ship a `<base href="//burningseries.ac/">` tag, and an
    // unspecified base would adopt that protocol-relative URL, producing
    // broken "//host/path" locations.
    history: createWebHashHistory('/'),
    routes,
})

export default router
