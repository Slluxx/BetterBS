<script setup>
import { nextTick, ref } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { useSessionStore } from '../stores/session'
import { clearAll } from '../../utils/storage.js'
import { log } from '../../utils/log.js'

const settings = useSettingsStore()
const session = useSessionStore()

const settingsDialog = ref(null)

// Two-step confirm: arming is a separate click from firing, so a stray click
// can't wipe anything. `wipeArmed` resets if the user wanders off.
const wipeArmed = ref(false)
const wiping = ref(false)

function open() {
    wipeArmed.value = false
    nextTick(() => settingsDialog.value?.showModal())
}

function close() {
    settingsDialog.value?.close()
}

async function wipe() {
    if (!wipeArmed.value) {
        wipeArmed.value = true
        return
    }
    wiping.value = true
    // Sign out FIRST. The favourites list and the login state are served by the
    // site, not by us: while the session cookie is alive the server hands back
    // your account's favourites on the next page load, and the episode check then
    // re-raises the alert. Wiping local data alone would look like it did nothing.
    // logout() force-expires the cookie client-side too, so this still works when
    // the server is unreachable.
    //
    // Swallowed separately: a failed sign-out must not stop the local wipe, or
    // the button would appear to do nothing at all.
    await session.logout().catch(e => log('[settings] sign-out during reset failed', e?.message))
    try {
        await clearAll()
        log('[settings] reset done, reloading')
        // Reloading is what makes this a real reset: every store is rebuilt from
        // storage on mount, so nothing can survive in memory holding a stale
        // copy of what was just deleted.
        location.reload()
    } catch (e) {
        log('[settings] reset failed', e?.message)
        wiping.value = false
        wipeArmed.value = false
    }
}

defineExpose({ open })
</script>

<template>
    <dialog ref="settingsDialog" class="modal">
        <div class="modal-box max-w-none w-[min(44rem,90vw)]">
            <h3 class="text-lg font-bold mb-4">Einstellungen</h3>

            <div class="form-control">
                <span class="label-text font-semibold mb-2">Neue-Folgen-Benachrichtigungen</span>

                <label class="label justify-start gap-3 cursor-pointer py-2">
                    <input type="radio" name="notif-mode" value="always" class="radio radio-primary"
                        :checked="settings.notificationMode === 'always'"
                        @change="settings.set({ notificationMode: 'always' })" />
                    <span class="label-text">
                        Immer bei neuen Folgen
                        <span class="block text-xs opacity-60">
                            Alarm bei jeder neuen Folge, die neuer ist als die zuletzt gespeicherte —
                            egal, wo du aufgehört hast.
                        </span>
                    </span>
                </label>

                <label class="label justify-start gap-3 cursor-pointer py-2">
                    <input type="radio" name="notif-mode" value="caught-up" class="radio radio-primary"
                        :checked="settings.notificationMode === 'caught-up'"
                        @change="settings.set({ notificationMode: 'caught-up' })" />
                    <span class="label-text">
                        Nur wenn ich auf dem neuesten Stand bin
                        <span class="block text-xs opacity-60">
                            Alarm nur für Serien, deren letzte verfügbare Folge du bereits gesehen hast.
                        </span>
                    </span>
                </label>
            </div>

            <div class="divider my-4"></div>

            <div class="form-control">
                <span class="label-text font-semibold mb-2">Alles zurücksetzen</span>
                <span class="text-xs opacity-70 mb-2">
                    Löscht alle Einstellungen, Favoriten, zuletzt gesehene Folgen und
                    Benachrichtigungen aus dem lokalen Speicher des Browsers und aus dem
                    Speicher der Erweiterung und meldet dich bei der Website ab. Ohne
                    Abmeldung liefert die Website deine Favoriten beim nächsten Laden
                    wieder aus. Die Seite wird danach neu geladen.
                </span>
                <div class="flex items-center gap-3 mt-1">
                    <button v-if="!wipeArmed" class="btn btn-sm btn-outline btn-error"
                        @click="wipe">
                        Alles zurücksetzen
                    </button>
                    <template v-else>
                        <span class="text-xs font-semibold text-error">
                            Wirklich zurücksetzen und abmelden?
                        </span>
                        <button class="btn btn-sm btn-error" :disabled="wiping" @click="wipe">
                            {{ wiping ? 'Wird zurückgesetzt …' : 'Ja, zurücksetzen' }}
                        </button>
                        <button class="btn btn-sm btn-ghost" :disabled="wiping" @click="wipeArmed = false">
                            Abbrechen
                        </button>
                    </template>
                </div>
            </div>

            <div class="modal-action">
                <button class="btn" @click="close()">Schließen</button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button>close</button>
        </form>
    </dialog>
</template>
