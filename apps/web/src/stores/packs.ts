import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Pack, PackCreate, PackUpdate } from 'contracts'
import { api, ApiError } from '@/lib/api'

export type PacksStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Writes rethrow the `ApiError` so the dialog can show a 400/409 (`name_taken`,
 * `duplicate_word`) next to its field; only `load()` records `error` for the screen.
 */
export const usePacksStore = defineStore('packs', () => {
  const packs = ref<Pack[]>([])
  const status = ref<PacksStatus>('idle')
  const error = ref<string | null>(null)

  async function load(): Promise<void> {
    status.value = 'loading'
    error.value = null
    try {
      packs.value = await api.packs.list()
      status.value = 'ready'
    } catch (e) {
      error.value = e instanceof ApiError ? e.message : 'Packs could not be loaded.'
      status.value = 'error'
    }
  }

  async function create(body: PackCreate): Promise<Pack> {
    const pack = await api.packs.create(body)
    packs.value = [...packs.value, pack]
    return pack
  }

  async function update(id: string, body: PackUpdate): Promise<Pack> {
    const pack = await api.packs.patch(id, body)
    packs.value = packs.value.map((p) => (p.id === id ? pack : p))
    return pack
  }

  async function remove(id: string): Promise<void> {
    await api.packs.remove(id)
    packs.value = packs.value.filter((p) => p.id !== id)
  }

  return { packs, status, error, load, create, update, remove }
})
