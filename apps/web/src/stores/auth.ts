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

  async function login(email: string, password: string): Promise<void> {
    admin.value = await api.auth.login({ email, password })
    status.value = 'authenticated'
  }

  async function logout(): Promise<void> {
    try {
      await api.auth.logout()
    } finally {
      admin.value = null
      status.value = 'anonymous'
    }
  }

  return { admin, status, setupStatus, load, loadSetupStatus, login, logout }
})
