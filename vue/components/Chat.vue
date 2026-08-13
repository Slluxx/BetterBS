<template>
    <div class="drawer-side z-50">
        <label for="chat-drawer" class="drawer-overlay"></label>
        <aside class="bg-base-100 w-96 max-w-full h-full flex flex-col shadow-xl">
            <div class="px-5 py-4 border-b border-base-300 flex justify-between items-center shrink-0">
                <h2 class="font-bold text-lg">Live-Chat</h2>
                <span class="badge badge-success">{{ online }} online</span>
            </div>
            <div ref="scroller" class="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
                <div v-for="p in posts" :key="p.id" class="chat"
                    :class="p.user === session.username ? 'chat-end' : 'chat-start'">
                    <div :class="['chat-header', 'opacity-80']">
                        <span :class="[{ 'text-blue-400': p.rank === 'mod', 'text-purple-400': p.rank === 'cmod','text-green-400': p.rank === 'smod', 'text-red-400': p.rank === 'admin' }]">{{ p.user }}</span>
                        <span v-if="p.rank !== 'user'"> ({{ p.rank }})</span>
                        <time class="text-xs">{{ p.time }}</time>
                    </div>
                    <div class="chat-bubble"  v-html="formatText(p.text)"></div>
                </div>
                <p v-if="!posts.length && !loading" class="text-center text-sm opacity-50 py-8">
                    Keine Nachrichten
                </p>
            </div>
            <div class="p-4 border-t border-base-300 shrink-0">
                <form @submit.prevent="send" class="flex gap-2">
                    <input v-model="message" :disabled="!session.loggedIn" class="input input-bordered w-full"
                        placeholder="Nachricht schreiben..." autocomplete="off" />
                    <button v-if="session.loggedIn" type="submit" class="btn btn-primary"
                        :disabled="!canSend || busySending">Senden</button>
                    <button v-else type="button" class="btn btn-primary" @click="session.openLogin()">Anmelden</button>
                </form>
                <p v-if="!session.loggedIn" class="text-xs opacity-60 mt-2">
                    Melde dich an, um Nachrichten zu schreiben.
                </p>
            </div>
        </aside>
    </div>
</template>
<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useSessionStore } from '../stores/session'
import { useSiteStore } from '../stores/site'
import { BASE } from '@/utils/scraper.js'

const session = useSessionStore()

// The site adds `token` (the meta security_token content) to every AJAX
// request via $.ajaxSetup. Mirror that: read the live page's meta tag, which
// is what the site's own scripts would use, and fall back to a token from a
// background-fetched page.
function getToken() {
    const live = document.querySelector('meta[name="security_token"]')?.getAttribute('content')
    if (live) return live
    return useSiteStore().securityToken || ''
}

const posts = ref([])
const last = ref(0)
const online = ref(0)
const message = ref('')
const loading = ref(true)
const busySending = ref(false)
const scroller = ref(null)

const canSend = computed(() => message.value.trim().length >= 2)

let pollTimer = null
let onlineTimer = null
let running = false
let disposed = false

function scrollToBottom() {
    nextTick(() => {
        if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
    })
}

// The site's AJAX returns chat text already HTML-entity-encoded (&apos;, &auml;,
// &#39; …). Decode them first so they render as their literal characters, then
// escape everything again so the v-html output can't inject markup.
// A <textarea> is an RCDATA element: its innerHTML decodes every character
// reference without running scripts. A literal close-tag in the message is
// entity-escaped before parsing (it decodes right back) so the RCDATA block
// can't be broken out of.
function decodeEntities(text) {
    const safe = String(text).replace(/<\/textarea/gi, '&lt;/textarea')
    const el = document.createElement('textarea')
    el.innerHTML = safe
    return el.value
}

function formatText(text) {
    const escaped = decodeEntities(text).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c])
    return escaped.replace(
        /(https?:\/\/[^\s<]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer" class="link link-primary">$1</a>',
    )
}

// Posts arrive newest-first; merge them deduped and keep the list chronological.
function addPosts(list) {
    if (!Array.isArray(list)) return
    const seen = new Set(posts.value.map((p) => p.id))
    let added = false
    for (const p of list) {
        const id = Number(p.id)
        if (!id || seen.has(id)) continue
        seen.add(id)
        posts.value.push({ id, user: p.user, rank: p.rank, time: p.time, text: p.text })
        added = true
    }
    posts.value.sort((a, b) => a.id - b.id)
    if (added) scrollToBottom()
}

async function updatePosts() {
    if (running || disposed) return
    running = true
    try {
        const res = await fetch(`${BASE}/ajax/sb-posts.php`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json, text/javascript, */*; q=0.01',
            },
            body: new URLSearchParams({ last: last.value, token: getToken() }),
        })
        const data = await res.json()
        if (data && Array.isArray(data.posts)) {
            if (Number(data.last)) last.value = Number(data.last)
            addPosts(data.posts)
        }
    } catch (e) { /* transient / anti-bot */ }
    finally {
        loading.value = false
        running = false
        if (!disposed) pollTimer = setTimeout(updatePosts, 5000)
    }
}

async function updateOnline() {
    if (disposed) return
    try {
        const res = await fetch(`${BASE}/ajax/sb-user.php`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json, text/javascript, */*; q=0.01',
            },
            body: new URLSearchParams({ token: getToken() }),
        })
        const data = await res.json()
        if (data && data.success && Array.isArray(data.user)) {
            online.value = data.user.length
        }
    } catch (e) { /* ignore */ }
    finally {
        if (!disposed) onlineTimer = setTimeout(updateOnline, 60000)
    }
}

async function send() {
    const text = message.value.trim()
    if (!session.loggedIn || text.length < 2 || busySending.value) return
    busySending.value = true
    try {
        const res = await fetch(`${BASE}/ajax/sb-send.php`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json, text/javascript, */*; q=0.01',
            },
            body: new URLSearchParams({ last: last.value, text, token: getToken() }),
        })
        const data = await res.json()
        if (data && data.success) {
            if (Number(data.last)) last.value = Number(data.last)
            message.value = ''
            // The send response returns the new post(s) in `posts` — merge them
            // directly, otherwise `last` has already advanced past them and the
            // next poll would never deliver them.
            if (Array.isArray(data.posts) && data.posts.length) {
                addPosts(data.posts)
            } else {
                await updatePosts()
            }
        }
    } catch (e) { /* ignore */ }
    finally {
        busySending.value = false
    }
}

onMounted(() => {
    updatePosts()
    updateOnline()
})

onUnmounted(() => {
    disposed = true
    clearTimeout(pollTimer)
    clearTimeout(onlineTimer)
})
</script>
