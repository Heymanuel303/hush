import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Device, DevicePatch, KidModePut, PairingCode } from 'contracts'
import { api, ApiError } from '@/lib/api'

export type DevicesStatus = 'idle' | 'loading' | 'ready' | 'error'

/** Writes rethrow the `ApiError` so a dialog can show it in place; only `load()` sets `error`. */
export const useDevicesStore = defineStore('devices', () => {
  const devices = ref<Device[]>([])
  const status = ref<DevicesStatus>('idle')
  const error = ref<string | null>(null)
  const showRevoked = ref(false)

  const visible = computed(() =>
    showRevoked.value ? devices.value : devices.value.filter((d) => !d.revokedAt),
  )
  const revokedCount = computed(() => devices.value.filter((d) => d.revokedAt).length)

  async function load(): Promise<void> {
    status.value = 'loading'
    error.value = null
    try {
      devices.value = await api.devices.list()
      status.value = 'ready'
    } catch (e) {
      error.value = e instanceof ApiError ? e.message : 'Devices could not be loaded.'
      status.value = 'error'
    }
  }

  /** Refreshes in place (polling): a failure keeps what is on screen. */
  async function refresh(): Promise<Device[]> {
    devices.value = await api.devices.list()
    return devices.value
  }

  function replace(device: Device): Device {
    devices.value = devices.value.map((d) => (d.id === device.id ? device : d))
    return device
  }

  async function patch(id: string, body: DevicePatch): Promise<Device> {
    return replace(await api.devices.patch(id, body))
  }

  async function revoke(id: string): Promise<void> {
    await api.devices.revoke(id)
    await refresh()
  }

  async function putKidMode(id: string, body: KidModePut): Promise<Device> {
    return replace(await api.devices.putKidMode(id, body))
  }

  function createPairingCode(profileId: string): Promise<PairingCode> {
    return api.profiles.createPairingCode(profileId)
  }

  return {
    devices, status, error, showRevoked, visible, revokedCount,
    load, refresh, patch, revoke, putKidMode, createPairingCode,
  }
})
