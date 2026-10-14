import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { ProfileCreate, ProfilePatch, ProfileWithRules, RuleSet, Template } from 'contracts'
import { api, ApiError } from '@/lib/api'

export type ProfilesStatus = 'idle' | 'loading' | 'ready' | 'error'

/**
 * Writes rethrow the `ApiError` so the editor can show a 412 `stale_version`, 422
 * `unknown_pack` or 400 `duplicate_word` in place; only `load()` records `error` for the screen.
 */
export const useProfilesStore = defineStore('profiles', () => {
  const profiles = ref<ProfileWithRules[]>([])
  const templates = ref<Template[]>([])
  const status = ref<ProfilesStatus>('idle')
  const error = ref<string | null>(null)

  async function load(): Promise<void> {
    status.value = 'loading'
    error.value = null
    try {
      profiles.value = await api.profiles.list()
      status.value = 'ready'
    } catch (e) {
      error.value = e instanceof ApiError ? e.message : 'Profiles could not be loaded.'
      status.value = 'error'
    }
  }

  async function loadTemplates(): Promise<void> {
    templates.value = await api.profiles.templates()
  }

  function upsert(profile: ProfileWithRules): ProfileWithRules {
    profiles.value = profiles.value.some((p) => p.id === profile.id)
      ? profiles.value.map((p) => (p.id === profile.id ? profile : p))
      : [...profiles.value, profile]
    return profile
  }

  async function create(body: ProfileCreate): Promise<ProfileWithRules> {
    return upsert(await api.profiles.create(body))
  }

  async function patch(id: string, body: ProfilePatch): Promise<ProfileWithRules> {
    return upsert(await api.profiles.patch(id, body))
  }

  /** Sends `If-Match: version`; a 412 `ApiError` propagates so the editor can offer a reload. */
  async function putRules(id: string, version: number, rules: RuleSet): Promise<ProfileWithRules> {
    return upsert(await api.profiles.putRules(id, version, rules))
  }

  /** Fetches one profile (the editor's reload and deep link) and merges it into the list. */
  async function fetchOne(id: string): Promise<ProfileWithRules> {
    return upsert(await api.profiles.get(id))
  }

  async function remove(id: string): Promise<void> {
    await api.profiles.remove(id)
    profiles.value = profiles.value.filter((p) => p.id !== id)
  }

  return { profiles, templates, status, error, load, loadTemplates, create, patch, putRules, fetchOne, remove }
})
