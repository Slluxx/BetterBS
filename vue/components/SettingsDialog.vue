<script setup>
import { nextTick, ref } from 'vue'
import { useSettingsStore } from '../stores/settings'

const settings = useSettingsStore()

const settingsDialog = ref(null)

function open() {
    nextTick(() => settingsDialog.value?.showModal())
}

function close() {
    settingsDialog.value?.close()
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

            <div class="modal-action">
                <button class="btn" @click="close()">Schließen</button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button>close</button>
        </form>
    </dialog>
</template>
