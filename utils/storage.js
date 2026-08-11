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

// ---- one-time diagnostic -------------------------------------------------
// Verifies each storage backend works AND that data written on a previous
// page load survives. The "persisted-across-reload" flags read a probe that a
// previous load of this page wrote — so on the very first load they report
// "first load", and from the second load on they show yes/no.
(async () => {
    const probe = '__bs_persist_probe__'
    const report = {}

    try {
        const before = localStorage.getItem(probe)
        localStorage.setItem(probe, '1')
        const after = localStorage.getItem(probe)
        report.localStorage = after === '1' ? 'ok' : 'write-dropped'
        report.localStoragePersistedAcrossReload = before === '1'
            ? 'yes'
            : 'first load'
    } catch (e) {
        report.localStorage = `error: ${e?.message || e}`
        report.localStoragePersistedAcrossReload = 'n/a'
    }

    if (backend) {
        try {
            const before = await backend.get(probe)
            await backend.set({ [probe]: 1 })
            const after = await backend.get(probe)
            report.extensionStorage = after[probe] === 1 ? 'ok' : 'write-dropped'
            report.extensionStoragePersistedAcrossReload = before[probe] === 1
                ? 'yes'
                : 'first load'
        } catch (e) {
            report.extensionStorage = `error: ${e?.message || e}`
            report.extensionStoragePersistedAcrossReload = 'n/a'
        }
    } else {
        report.extensionStorage = 'unavailable (no chrome/browser storage API)'
        report.extensionStoragePersistedAcrossReload = 'n/a'
    }

    console.log('[BetterBS storage] backend check:', JSON.stringify(report))
})()
