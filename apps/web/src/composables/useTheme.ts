import { computed, effectScope, type ComputedRef, type Ref } from 'vue'
import { useColorMode, useStorage } from '@vueuse/core'

// Device setting, stored in this browser only: never sent to the api.
// Shared with the no-flash script in index.html: key `hush-theme`, values
// `light` | `dark` | `auto`; anything else means `auto`.
export type ThemePreference = 'light' | 'dark' | 'auto'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'hush-theme'
const PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'auto']

function isPreference(value: unknown): value is ThemePreference {
  return PREFERENCES.some((p) => p === value)
}

interface Theme {
  preference: Ref<ThemePreference>
  resolved: ComputedRef<ResolvedTheme>
  setPreference(p: ThemePreference): void
}

let theme: Theme | undefined

function createTheme(): Theme {
  // The serializer maps a garbage or missing stored value to `auto`, so
  // useColorMode never sees anything but the three preferences. With a
  // storageRef, useColorMode ignores storageKey; the key lives here.
  const store = useStorage<ThemePreference>(STORAGE_KEY, 'auto', undefined, {
    writeDefaults: false,
    serializer: {
      read: (raw) => (isPreference(raw) ? raw : 'auto'),
      write: (value) => value,
    },
  })
  const mode = useColorMode({ storageRef: store, emitAuto: true })
  return {
    preference: store,
    resolved: computed(() => (store.value === 'auto' ? mode.system.value : store.value)),
    setPreference(p) {
      store.value = isPreference(p) ? p : 'auto'
    },
  }
}

// Module-level singleton in a detached scope: every caller gets the same refs,
// so two components never fight over the html class, and the watchers outlive
// whichever component called first.
export function useTheme(): Theme {
  if (!theme) theme = effectScope(true).run(createTheme)
  if (!theme) throw new Error('useTheme: could not create the theme scope')
  return theme
}
