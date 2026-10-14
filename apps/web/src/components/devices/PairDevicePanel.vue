<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Check, Copy, LoaderCircle } from '@lucide/vue'
import type { PairingCode } from 'contracts'
import ErrorState from '@/components/state/ErrorState.vue'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ApiError } from '@/lib/api'
import { countdown } from '@/lib/devices'
import { useDevicesStore } from '@/stores/devices'
import { useProfilesStore } from '@/stores/profiles'

// The body of "Pair a device", shared by PairDeviceDialog (Devices screen) and the setup wizard.
// Step 1 picks a profile (skipped when `profileId` is given), step 2 shows the code and waits
// for the device to appear. Mount it when pairing starts; unmounting stops its timers.
const props = withDefaults(defineProps<{ profileId?: string; cancelable?: boolean; doneLabel?: string }>(), {
  cancelable: true,
  doneLabel: 'Done',
})
const emit = defineEmits<{ done: []; cancel: [] }>()

const POLL_MS = 3000
const devices = useDevicesStore()
const profiles = useProfilesStore()

const chosen = ref(props.profileId ?? '')
const code = ref<PairingCode | null>(null)
const creating = ref(false)
const error = ref('')
const now = ref(Date.now())
const pairedLabel = ref<string | null>(null)
const copied = ref(false)
let knownIds = new Set<string>()
let tick: ReturnType<typeof setInterval> | undefined
let poll: ReturnType<typeof setInterval> | undefined

const hubUrl = window.location.origin
const remaining = computed(() => (code.value ? countdown(code.value.expiresAt, now.value) : null))
const letters = computed(() => (code.value ? code.value.code.toUpperCase().split('') : []))
const profileName = computed(() => profiles.profiles.find((p) => p.id === code.value?.profileId)?.name)

function stopTimers() {
  clearInterval(tick)
  clearInterval(poll)
  tick = poll = undefined
}

async function watchForDevice() {
  try {
    const list = await devices.refresh()
    const fresh = list.find((d) => !knownIds.has(d.id))
    if (fresh) {
      pairedLabel.value = fresh.label
      stopTimers()
    }
  } catch {
    // A missed poll is retried in three seconds; the code on screen stays valid.
  }
}

async function makeCode(profileId: string) {
  creating.value = true
  error.value = ''
  copied.value = false
  try {
    code.value = await devices.createPairingCode(profileId)
    now.value = Date.now()
    if (!tick) tick = setInterval(() => (now.value = Date.now()), 1000)
    if (!poll) poll = setInterval(watchForDevice, POLL_MS)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : 'The code could not be created. Try again.'
  } finally {
    creating.value = false
  }
}

onMounted(async () => {
  // Snapshot from a fresh list: the store may still be empty when opened from `?pair=`.
  try {
    knownIds = new Set((await devices.refresh()).map((d) => d.id))
  } catch {
    knownIds = new Set(devices.devices.map((d) => d.id))
  }
  if (profiles.status === 'idle') await profiles.load()
  if (!chosen.value && profiles.profiles.length === 1) chosen.value = profiles.profiles[0]?.id ?? ''
  if (props.profileId) await makeCode(props.profileId)
})

async function copyUrl() {
  try {
    await navigator.clipboard.writeText(hubUrl)
    copied.value = true
  } catch {
    error.value = 'Copy is not available here. Select the address and copy it by hand.'
  }
}

onBeforeUnmount(stopTimers)
</script>

<template>
  <div class="flex min-w-0 flex-col gap-4">
    <p class="text-muted-foreground text-sm">
      {{ code ? `The device will follow ${profileName ?? 'the chosen profile'}.` : profileId ? '' : 'Choose the profile this browser should follow.' }}
    </p>
    <div v-if="!code && profileId" class="flex min-w-0 flex-col gap-4">
      <ErrorState v-if="error" title="No code yet" :message="error">
        <template #retry>
          <Button type="button" variant="outline" size="sm" :disabled="creating" @click="makeCode(profileId)">Try again</Button>
        </template>
      </ErrorState>
      <p v-else role="status" class="text-muted-foreground text-sm">Making the pairing code…</p>
    </div>
    <form
      v-else-if="!code"
      class="flex min-w-0 flex-col gap-4"
      novalidate
      @submit.prevent="chosen && makeCode(chosen)"
    >
      <div class="flex min-w-0 flex-col gap-1.5">
        <Label for="pair-profile">Profile</Label>
        <Select v-model="chosen">
          <SelectTrigger id="pair-profile" class="w-full"><SelectValue placeholder="Choose a profile" /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="p in profiles.profiles" :key="p.id" :value="p.id">{{ p.name }}</SelectItem>
          </SelectContent>
        </Select>
        <p v-if="profiles.status === 'ready' && profiles.profiles.length === 0" class="text-muted-foreground text-sm">
          Create a profile first, then pair a device to it.
        </p>
      </div>
      <p v-if="error" role="alert" class="text-destructive text-sm">{{ error }}</p>
      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button v-if="cancelable" type="button" variant="outline" @click="emit('cancel')">Cancel</Button>
        <Button type="submit" :disabled="!chosen || creating">
          <LoaderCircle v-if="creating" class="animate-spin" aria-hidden="true" />
          Show code
        </Button>
      </div>
    </form>

    <div v-else class="flex min-w-0 flex-col gap-4">
      <div class="bg-card flex flex-col gap-3 rounded-xl border p-4">
        <div role="group" :aria-label="`Pairing code ${letters.join(' ')}`" class="flex justify-between gap-2">
          <span
            v-for="(letter, i) in letters"
            :key="i"
            data-testid="code-tile"
            :class="[
              'text-primary bg-muted flex h-14 min-w-0 flex-1 items-center justify-center rounded-md font-mono text-3xl font-semibold',
              remaining?.expired && 'opacity-40',
            ]"
          >{{ letter }}</span>
        </div>
        <div class="flex items-center gap-3">
          <progress
            class="[&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary h-1 flex-1 appearance-none overflow-hidden rounded-full border-0 [&::-webkit-progress-bar]:rounded-full"
            :value="Math.round((remaining?.fraction ?? 0) * 600)"
            max="600"
            aria-hidden="true"
          />
          <span
            data-testid="code-remaining"
            class="text-muted-foreground font-mono text-sm tabular-nums"
            :aria-label="remaining?.expired ? 'Expired' : `${remaining?.text} left`"
          >{{ remaining?.text }}</span>
        </div>
        <p v-if="remaining?.expired" role="status" class="text-sm">This code has expired. Make a new one.</p>
      </div>

      <p v-if="pairedLabel" role="status" class="flex items-center gap-2 text-sm font-medium">
        <span class="bg-primary size-2 rounded-full" aria-hidden="true" />
        Paired: {{ pairedLabel }}
      </p>

      <div class="flex min-w-0 flex-col gap-1.5">
        <span class="text-sm font-medium">Hub address to type</span>
        <div class="flex items-center gap-2">
          <code class="bg-muted min-w-0 flex-1 truncate rounded-md px-3 py-2 font-mono text-sm">{{ hubUrl }}</code>
          <Button type="button" variant="outline" size="sm" @click="copyUrl">
            <component :is="copied ? Check : Copy" aria-hidden="true" />
            {{ copied ? 'Copied' : 'Copy' }}
          </Button>
        </div>
      </div>
      <p class="text-muted-foreground text-sm">
        In the Hush popup turn on Advanced, open Household hub, enter this address and the code, name the device.
      </p>
      <p v-if="error" role="alert" class="text-destructive text-sm">{{ error }}</p>
      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          v-if="remaining?.expired || !pairedLabel"
          type="button"
          variant="outline"
          :disabled="creating"
          @click="code && makeCode(code.profileId)"
        >
          New code
        </Button>
        <Button type="button" @click="emit('done')">{{ doneLabel }}</Button>
      </div>
    </div>
  </div>
</template>
