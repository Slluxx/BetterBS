// Extension-wide key/value storage.
//
// Writes go to TWO backends so data survives everywhere:
//   1. page localStorage — always available to the content script, needs no
//      permission, and survives extension reloads / stale installs.
//   2. browser.storage.local — shared across all mirror domains.
// Reads prefer the in-memory cache, then the freshest of the two backends
// (via hydrate()), and fall back to the localStorage mirror for the
// synchronous get() path.
//
// The two copies can drift: extension-storage writes are asynchronous and
// fire-and-forget, so a write racing a page unload (or failing silently) can
// be lost, leaving that backend stale. To reconcile, every write also bumps a
// per-key timestamp in a small meta record kept on BOTH backends. Hydration
// then picks whichever copy was written most recently — localStorage's meta is
// written synchronously so it always reflects the freshest state seen on this
// mirror, while the extension meta enables bootstrap on a new mirror.

const cache = new Map()

// Stores per-key last-write timestamps (used only to reconcile the two
// backends during hydration — not a TTL).
const META_KEY = '__bs_meta__'

// Prefer the WebExtension API when present (Firefox / polyfill), otherwise the
// Chrome-style API.
const backend = (() => {
    try {
        if (globalThis.browser?.storage?.local) return globalThis.browser.storage.local
    } catch { /* ignore */ }
    try {
        if (globalThis.chrome?.storage?.local) return globalThis.chrome.storage.local
    } catch { /* ignore */ }
    return null
})()

function readLocal(key) {
    try {
        const raw = localStorage.getItem(key)
        return raw === null ? undefined : JSON.parse(raw)
    } catch {
        return undefined
    }
}

function writeLocal(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value))
    } catch { /* storage full / unavailable */ }
}

function clearLocal(key) {
    try {
        localStorage.removeItem(key)
    } catch { /* ignore */ }
}

// The per-key write timestamps live on the localStorage mirror. The extension
// backend gets a copy via persistMeta() so a fresh mirror can compare.
function readMeta() {
    const m = readLocal(META_KEY)
    return m && typeof m === 'object' ? m : {}
}

function bumpMeta(key) {
    try {
        const meta = readMeta()
        meta[key] = Date.now()
        writeLocal(META_KEY, meta)
    } catch { /* ignore */ }
}

// Chrome/browser storage writes are async and fire-and-forget; serializing them
// guarantees two rapid writes land in order (a slow earlier write could
// otherwise overwrite a newer one).
let writeChain = Promise.resolve()
function persist(key, value) {
    if (!backend) return
    writeChain = writeChain
        .then(() => backend.set({ [key]: value }))
        .catch(() => { /* ignore */ })
}

function persistRemove(key) {
    if (!backend) return
    writeChain = writeChain
        .then(() => backend.remove(key))
        .catch(() => { /* ignore */ })
}

function persistMeta() {
    if (!backend) return
    writeChain = writeChain
        .then(() => backend.set({ [META_KEY]: readMeta() }))
        .catch(() => { /* ignore */ })
}

export async function hydrate(key, fallback) {
    let value = fallback
    if (backend) {
        try {
            const localValue = readLocal(key)
            const localTs = readMeta()[key]

            const [obj, metaObj] = await Promise.all([
                backend.get(key),
                backend.get(META_KEY),
            ])
            const extValue = obj[key]
            const extTs = metaObj?.[META_KEY]?.[key]

            if (localValue === undefined && extValue === undefined) {
                value = fallback
            } else if (localValue === undefined) {
                // Only the extension backend has a copy. A local removal that is
                // newer than the extension copy must not resurrect the value.
                value = localTs !== undefined && extTs !== undefined && localTs > extTs
                    ? fallback
                    : extValue
            } else if (extValue === undefined) {
                value = localValue
            } else {
                // Both copies exist — use whichever was written later. Ties (or
                // values written before the meta record existed) prefer the local
                // copy, which is always freshest for this mirror.
                value = extTs !== undefined && localTs !== undefined && extTs > localTs
                    ? extValue
                    : localValue
            }
        } catch {
            // fall through to the localStorage mirror below
        }
    }
    // If the extension storage is unavailable or empty (e.g. a previously
    // installed build without the `storage` permission), fall back to the
    // localStorage mirror so data still restores.
    if (value === fallback) {
        const local = readLocal(key)
        if (local !== undefined) value = local
    }
    cache.set(key, value)
    return value
}

export function get(key, fallback) {
    if (cache.has(key)) return cache.get(key)
    // Synchronous fallback so stores can read persisted data before hydrate().
    const local = readLocal(key)
    if (local !== undefined) return local
    return fallback
}

export function set(key, value) {
    cache.set(key, value)
    writeLocal(key, value)
    bumpMeta(key)
    persist(key, value)
    persistMeta()
}

export function remove(key) {
    cache.delete(key)
    clearLocal(key)
    bumpMeta(key)
    persistRemove(key)
    persistMeta()
}

// Every key this extension owns. Matched by shape rather than listed, so keys
// left behind by older builds (`bs_new_episodes`, before the v2 rewrite) are
// swept up too — a leftover from a previous schema is exactly the kind of
// inconsistency a wipe has to remove.
function isOwnedKey(key) {
    return key === 'recentlyVisited' || key.startsWith('bs_') || key.startsWith('__bs_')
}

function localKeys() {
    try {
        return Object.keys(localStorage)
    } catch {
        return []
    }
}

// Wipes every trace of this extension from BOTH backends.
//
// This is deliberately total rather than selective. The point of the button is
// to get back to a known-empty state, and a partial clear that misses one key
// would leave the two backends free to disagree again — which is the failure
// this exists to fix. The localStorage mirror only has the extension's own keys
// removed; the site's own storage is left alone, because that is not ours to
// delete.
export async function clearAll() {
    cache.clear()
    for (const key of localKeys()) {
        if (isOwnedKey(key)) clearLocal(key)
    }
    if (backend) {
        // storage.local belongs to this extension alone, so emptying it is safe
        // and is the only way to be sure nothing is left behind. It goes through
        // the write chain so any write still queued from earlier lands first and
        // cannot put a key back straight after the wipe.
        writeChain = writeChain
            .then(() => backend.clear())
            .catch(() => { })
        await writeChain
    } else {
        // No extension backend: nothing else to wait for, but keep the mirror and
        // the cache in step.
        await writeChain
    }
}

