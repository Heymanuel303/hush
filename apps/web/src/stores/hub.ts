import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { HubStatus } from 'contracts'
import { api } from '@/lib/api'

/** The hub's headline counts, fetched for the first-run redirect. Read-only; the wizard refreshes it. */
export const useHubStore = defineStore('hub', () => {
  const status = ref<HubStatus | null>(null)

  async function refresh(): Promise<HubStatus> {
    status.value = await api.auth.hubStatus()
    return status.value
  }

  /**
   * Cached for the session once the hub has a profile (that never goes back to zero unnoticed
   * enough to matter); an empty hub is asked again, so a profile made elsewhere ends the redirect.
   */
  async function ensure(): Promise<HubStatus> {
    if (status.value && status.value.profileCount > 0) return status.value
    return refresh()
  }

  function reset(): void {
    status.value = null
  }

  return { status, refresh, ensure, reset }
})
