import { ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  PiholeConnection,
  PiholeConnectionPut,
  PiholeSummary,
  PiholeTestResult,
} from 'contracts'
import { api, ApiError } from '@/lib/api'

export type PiholeStatus = 'idle' | 'loading' | 'ready' | 'error'

function messageFor(e: unknown): string {
  return e instanceof ApiError ? e.message : 'Something went wrong. Try again.'
}

export const usePiholeStore = defineStore('pihole', () => {
  const connection = ref<PiholeConnection | null>(null)
  const summary = ref<PiholeSummary | null>(null)
  const summaryError = ref<string | null>(null)
  const status = ref<PiholeStatus>('idle')
  const error = ref<string | null>(null)

  /** A 404 `not_configured` is the normal "not connected" state, not an error. */
  async function load(): Promise<void> {
    status.value = 'loading'
    error.value = null
    try {
      connection.value = await api.pihole.get()
      status.value = 'ready'
    } catch (e) {
      if (e instanceof ApiError && e.status === 404 && e.error === 'not_configured') {
        connection.value = null
        summary.value = null
        status.value = 'ready'
        return
      }
      error.value = messageFor(e)
      status.value = 'error'
    }
  }

  /** Throws the ApiError so the form can show it; the connection is replaced on success. */
  async function save(body: PiholeConnectionPut): Promise<void> {
    connection.value = await api.pihole.put(body)
    summary.value = null
    // A new URL, password or kid group changes what the numbers describe: fetch them again.
    await loadSummary()
  }

  /**
   * Tests the values in the body (saved or not). When the api re-reads the stored connection it
   * records the check there, so refresh it for "last checked" / "last error".
   */
  async function test(body: PiholeConnectionPut): Promise<PiholeTestResult> {
    const result = await api.pihole.test(body)
    try {
      connection.value = await api.pihole.get()
    } catch {
      // The test result is what the caller asked for; a stale timestamp is acceptable.
    }
    return result
  }

  async function disconnect(): Promise<void> {
    await api.pihole.remove()
    connection.value = null
    summary.value = null
    summaryError.value = null
  }

  async function loadSummary(): Promise<void> {
    summaryError.value = null
    try {
      summary.value = await api.pihole.summary()
    } catch (e) {
      summaryError.value = messageFor(e)
    }
  }

  return { connection, summary, summaryError, status, error, load, save, test, disconnect, loadSummary }
})
