<script setup lang="ts">
import { ref, watch } from 'vue'
import { LoaderCircle } from '@lucide/vue'
import { CAPS, DevicePatch } from 'contracts'
import type { Device, QuietHours } from 'contracts'
import ScheduleEditor from '@/components/schedule/ScheduleEditor.vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ApiError } from '@/lib/api'
import type { DeviceAction } from './DeviceActions.vue'
import { useDevicesStore } from '@/stores/devices'
import { useProfilesStore } from '@/stores/profiles'

// One small dialog per action (rename, profile, IP, schedule, revoke), opened from the row menu.
const props = defineProps<{ device: Device | null; action: DeviceAction | null }>()
const emit = defineEmits<{ close: [] }>()

const devices = useDevicesStore()
const profiles = useProfilesStore()

const text = ref('')
const profileId = ref('')
const schedule = ref<QuietHours | null>(null)
const error = ref('')
const saving = ref(false)

watch(
  () => [props.device?.id, props.action] as const,
  () => {
    const d = props.device
    error.value = ''
    text.value = props.action === 'ip' ? (d?.tailscaleIp ?? '') : (d?.label ?? '')
    profileId.value = d?.profileId ?? ''
    schedule.value = d?.kidMode.schedule ?? null
  },
  { immediate: true },
)

async function run(work: (d: Device) => Promise<unknown>) {
  if (!props.device) return
  saving.value = true
  error.value = ''
  try {
    await work(props.device)
    emit('close')
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'Could not save. Try again.'
  } finally {
    saving.value = false
  }
}

function submit() {
  const value = text.value.trim()
  switch (props.action) {
    case 'rename':
      if (!value) {
        error.value = 'Give the device a name.'
        return
      }
      return run((d) => devices.patch(d.id, { label: value }))
    case 'profile':
      return run((d) => devices.patch(d.id, { profileId: profileId.value }))
    case 'ip': {
      const patch = DevicePatch.safeParse({ tailscaleIp: value || null })
      if (!patch.success) {
        error.value = 'That is not an IP address. Tailscale addresses look like 100.64.0.7.'
        return
      }
      return run((d) => devices.patch(d.id, patch.data))
    }
    case 'schedule':
      // `enabled` stays as it is: the schedule only decides when kid mode applies.
      return run((d) => devices.putKidMode(d.id, { enabled: d.kidMode.enabled, schedule: schedule.value }))
    case 'revoke':
      return run((d) => devices.revoke(d.id))
  }
}

const TITLES: Record<DeviceAction, string> = {
  rename: 'Rename device',
  profile: 'Change profile',
  ip: 'Set Tailscale IP',
  schedule: 'Kid-mode schedule',
  revoke: 'Revoke device?',
}
</script>

<template>
  <Dialog :open="!!device && !!action" @update:open="(o) => !o && emit('close')">
    <DialogContent class="grid-cols-1 sm:max-w-lg">
      <template v-if="device && action">
        <DialogHeader>
          <DialogTitle>{{ TITLES[action] }}</DialogTitle>
          <DialogDescription>
            <template v-if="action === 'revoke'">
              The device drops back to its own local words on its next pull. Pair it again to reconnect.
            </template>
            <template v-else-if="action === 'ip'">
              Pi-hole counts and kid mode need the device’s Tailscale address. Find it in the Tailscale
              admin console, or run <code class="font-mono">tailscale ip</code> on the device.
            </template>
            <template v-else-if="action === 'schedule'">
              Kid mode applies inside these windows. Leave it off to switch kid mode by hand.
            </template>
            <template v-else>{{ device.label }}</template>
          </DialogDescription>
        </DialogHeader>
        <form class="flex min-w-0 flex-col gap-4" novalidate @submit.prevent="submit">
          <div v-if="action === 'rename' || action === 'ip'" class="flex flex-col gap-1.5">
            <Label for="device-text">{{ action === 'rename' ? 'Name' : 'Tailscale IP' }}</Label>
            <Input
              id="device-text"
              v-model="text"
              :maxlength="action === 'rename' ? CAPS.maxNameLength : 45"
              :class="action === 'ip' ? 'font-mono' : ''"
              :placeholder="action === 'ip' ? '100.64.0.7' : undefined"
              autocomplete="off"
              :aria-invalid="error ? true : undefined"
            />
            <p v-if="action === 'ip'" class="text-muted-foreground text-sm">Leave empty to remove the address.</p>
          </div>
          <div v-else-if="action === 'profile'" class="flex flex-col gap-1.5">
            <Label for="device-profile">Profile</Label>
            <Select v-model="profileId">
              <SelectTrigger id="device-profile" class="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="p in profiles.profiles" :key="p.id" :value="p.id">{{ p.name }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ScheduleEditor v-else-if="action === 'schedule'" v-model="schedule" :subject="`kid mode for ${device.label}`" />
          <p v-if="error" role="alert" class="text-destructive text-sm">{{ error }}</p>
          <DialogFooter>
            <Button type="button" variant="outline" @click="emit('close')">Cancel</Button>
            <Button type="submit" :disabled="saving">
              <LoaderCircle v-if="saving" class="animate-spin" aria-hidden="true" />
              {{ action === 'revoke' ? 'Revoke' : 'Save' }}
            </Button>
          </DialogFooter>
        </form>
      </template>
    </DialogContent>
  </Dialog>
</template>
