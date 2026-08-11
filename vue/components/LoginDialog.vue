<script setup>
import { reactive, ref, watch } from 'vue'
import { useSessionStore } from '../stores/session'

const session = useSessionStore()

const loginDialog = ref(null)

watch(() => session.loginModalOpen, (open) => {
    const el = loginDialog.value
    if (!el) return
    if (open && !el.open) el.showModal()
    else if (!open && el.open) el.close()
})

const form = reactive({
    username: '',
    password: '',
    remember: false,
})

async function submitLogin() {
    const ok = await session.login(form.username.trim(), form.password, form.remember)
    if (ok) {
        form.username = ''
        form.password = ''
        session.closeLogin()
    }
}
</script>

<template>
    <dialog ref="loginDialog" class="modal" @close="session.loginModalOpen = false">
        <div class="modal-box max-w-[min(32rem,90vw)]">
            <form @submit.prevent="submitLogin">
                <h3 class="text-lg font-bold mb-4">Anmelden</h3>

                <input v-model="form.username" type="text" class="input input-bordered w-full mb-2"
                    placeholder="Benutzername" autocomplete="username" required />

                <input v-model="form.password" type="password" class="input input-bordered w-full mb-2"
                    placeholder="Passwort" autocomplete="current-password" required />

                <label class="label justify-start gap-2 cursor-pointer">
                    <input v-model="form.remember" type="checkbox" class="checkbox checkbox-sm" />
                    <span class="label-text">Angemeldet bleiben</span>
                </label>

                <p v-if="session.error" class="text-error text-sm mt-2">{{ session.error }}</p>

                <div class="modal-action">
                    <button type="button" class="btn" @click="session.closeLogin()">Abbrechen</button>
                    <button type="submit" class="btn btn-primary" :disabled="session.busy">
                        {{ session.busy ? 'Anmelden...' : 'Anmelden' }}
                    </button>
                </div>
            </form>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button>close</button>
        </form>
    </dialog>
</template>
