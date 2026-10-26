import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { AdminInfo, SetupStatus } from 'contracts'
import { api, ApiError } from '@/lib/api'

export type AuthStatus = 'unknown' | 'anonymous' | 'authenticated'

export const useAuthStore = defineStore('auth', () => {
  const admin = ref<AdminInfo | null>(null)
  const status = ref<AuthStatus>('unknown')
  const setupStatus = ref<SetupStatus | null>(null)

  /** Asks the hub who is signed in. A 401 means anonymous; anything else is rethrown. */
  async function load(): Promise<void> {
    try {
      admin.value = await api.auth.me()
      status.value = 'authenticated'
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) throw e
      admin.value = null
      status.value = 'anonymous'
    }
  }

  async function loadSetupStatus(): Promise<void> {
    setupStatus.value = await api.auth.setupStatus()
  }

  /** Ends the local session, then leaves for the idp's end-session URL the api hands back. */
  async function logout(): Promise<void> {
    try {
      const { location } = await api.auth.logout()
      admin.value = null
      status.value = 'anonymous'
      window.location.assign(location)
    } catch (e) {
      admin.value = null
      status.value = 'anonymous'
      throw e
    }
  }

  return { admin, status, setupStatus, load, loadSetupStatus, logout }
})
