<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Globe, Lock, MonitorSmartphone } from '@lucide/vue'
import type { Device } from 'contracts'
import DeviceActionDialog from '@/components/devices/DeviceActionDialog.vue'
import DeviceActions from '@/components/devices/DeviceActions.vue'
import type { DeviceAction } from '@/components/devices/DeviceActions.vue'
import DeviceKidControl from '@/components/devices/DeviceKidControl.vue'
import PairDeviceDialog from '@/components/devices/PairDeviceDialog.vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import EmptyState from '@/components/state/EmptyState.vue'
import ErrorState from '@/components/state/ErrorState.vue'
import LoadingState from '@/components/state/LoadingState.vue'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ApiError } from '@/lib/api'
import { isOffline, relativeTime } from '@/lib/devices'
import { useDevicesStore } from '@/stores/devices'
import { usePiholeStore } from '@/stores/pihole'
import { useProfilesStore } from '@/stores/profiles'

const store = useDevicesStore()
const pihole = usePiholeStore()
const profiles = useProfilesStore()
const route = useRoute()
const router = useRouter()

const pairOpen = ref(false)
const pairProfile = ref<string | undefined>()
const action = ref<DeviceAction | null>(null)
const actionDevice = ref<Device | null>(null)
const busyId = ref<string | null>(null)
const toggleError = ref('')
const now = ref(Date.now())

const piholeConnected = computed(() => pihole.connection !== null)
const profileById = computed(() => new Map(profiles.profiles.map((p) => [p.id, p])))
const fmt = new Intl.NumberFormat()

function blocked(d: Device): string {
  const hit = d.tailscaleIp ? pihole.summary?.topClients.find((c) => c.ip === d.tailscaleIp) : undefined
  return hit ? fmt.format(hit.blocked) : '–'
}

async function init() {
  now.value = Date.now()
  await Promise.all([store.load(), profiles.load(), pihole.load()])
  if (pihole.connection) await pihole.loadSummary()
}

function openPair(profileId?: string) {
  pairProfile.value = profileId
  pairOpen.value = true
}

function setPairOpen(open: boolean) {
  pairOpen.value = open
  if (!open && route.query.pair) void router.replace({ name: 'devices' })
}

function choose(device: Device, which: DeviceAction) {
  actionDevice.value = device
  action.value = which
}

async function toggleKid(device: Device, enabled: boolean) {
  busyId.value = device.id
  toggleError.value = ''
  try {
    await store.putKidMode(device.id, { enabled, schedule: device.kidMode.schedule })
  } catch (e) {
    toggleError.value = e instanceof ApiError ? e.message : 'Kid mode could not be changed. Try again.'
  } finally {
    busyId.value = null
  }
}

watch(
  () => route.query.pair,
  (id) => {
    if (typeof id === 'string' && id) openPair(id)
  },
  { immediate: true },
)
onMounted(init)
</script>

<template>
  <TooltipProvider>
    <PageHeader title="Devices" description="Every browser paired to this hub.">
      <Button @click="openPair()">Pair a device</Button>
    </PageHeader>

    <Alert class="mb-6">
      <AlertDescription>
        The hub manages what Hush hides. It cannot stop someone removing or disabling Hush on a device that is not force-installed by a browser policy. For a locked device see browser/firefox/policies.json in the repository.
      </AlertDescription>
    </Alert>

    <LoadingState v-if="store.status === 'idle' || store.status === 'loading'" label="Loading devices" :rows="3" />

    <ErrorState v-else-if="store.status === 'error'" :message="store.error ?? 'Devices could not be loaded.'">
      <template #retry>
        <Button variant="outline" size="sm" @click="init">Try again</Button>
      </template>
    </ErrorState>

    <EmptyState
      v-else-if="store.devices.length === 0"
      :icon="MonitorSmartphone"
      title="No devices paired yet"
      description="Pair a browser to a profile and it follows that profile’s rules."
    >
      <template #action>
        <Button @click="openPair()">Pair a device</Button>
      </template>
    </EmptyState>

    <div v-else class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p v-if="!piholeConnected" class="text-muted-foreground text-sm">
          <RouterLink to="/pihole" class="underline underline-offset-4">Connect Pi-hole</RouterLink>
          to use kid mode
        </p>
        <span v-else />
        <div v-if="store.revokedCount > 0" class="flex items-center gap-2">
          <Checkbox
            id="show-revoked"
            :model-value="store.showRevoked"
            @update:model-value="(v) => (store.showRevoked = v === true)"
          />
          <Label for="show-revoked">Show revoked</Label>
        </div>
      </div>
      <p v-if="toggleError" role="alert" class="text-destructive text-sm">{{ toggleError }}</p>

      <Table class="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead>Device</TableHead>
            <TableHead>Profile</TableHead>
            <TableHead>Last seen</TableHead>
            <TableHead>Kid mode</TableHead>
            <TableHead class="text-right">Blocked by Pi-hole</TableHead>
            <TableHead class="w-12"><span class="sr-only">Actions</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="d in store.visible" :key="d.id" :class="['h-10', d.revokedAt && 'text-muted-foreground']">
            <TableCell>
              <div class="flex items-center gap-2">
                <Globe class="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
                <div class="flex min-w-0 flex-col">
                  <span class="max-w-48 truncate font-medium">{{ d.label }}</span>
                  <span class="text-muted-foreground font-mono text-xs">{{ d.tailscaleIp ?? 'no IP' }}</span>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <span class="inline-flex items-center gap-1.5">
                <Lock v-if="profileById.get(d.profileId)?.locked" class="size-3.5" aria-label="Locked profile" />
                {{ profileById.get(d.profileId)?.name ?? 'Unknown profile' }}
              </span>
            </TableCell>
            <TableCell>
              <span v-if="d.revokedAt">Revoked</span>
              <span v-else class="inline-flex items-center gap-2">
                {{ relativeTime(d.lastSeenAt, now) }}
                <Badge v-if="isOffline(d.lastSeenAt, now)" variant="secondary">Offline</Badge>
              </span>
            </TableCell>
            <TableCell>
              <span v-if="d.revokedAt">–</span>
              <DeviceKidControl
                v-else
                :device="d"
                :pihole-connected="piholeConnected"
                :busy="busyId === d.id"
                @toggle="toggleKid(d, $event)"
              />
            </TableCell>
            <TableCell class="text-right font-mono">{{ blocked(d) }}</TableCell>
            <TableCell>
              <DeviceActions v-if="!d.revokedAt" :device="d" @choose="choose(d, $event)" />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>

      <ul class="flex flex-col gap-3 md:hidden" aria-label="Devices">
        <li
          v-for="d in store.visible"
          :key="d.id"
          :class="['bg-card flex flex-col gap-3 rounded-lg border p-4', d.revokedAt && 'text-muted-foreground']"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="flex min-w-0 items-center gap-2">
              <Globe class="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
              <div class="flex min-w-0 flex-col">
                <span class="truncate font-medium">{{ d.label }}</span>
                <span class="text-muted-foreground font-mono text-xs">{{ d.tailscaleIp ?? 'no IP' }}</span>
              </div>
            </div>
            <DeviceActions v-if="!d.revokedAt" :device="d" @choose="choose(d, $event)" />
          </div>
          <dl class="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
            <dt class="text-muted-foreground">Profile</dt>
            <dd class="inline-flex items-center gap-1.5">
              <Lock v-if="profileById.get(d.profileId)?.locked" class="size-3.5" aria-label="Locked profile" />
              {{ profileById.get(d.profileId)?.name ?? 'Unknown profile' }}
            </dd>
            <dt class="text-muted-foreground">Last seen</dt>
            <dd class="inline-flex items-center gap-2">
              <template v-if="d.revokedAt">Revoked</template>
              <template v-else>
                {{ relativeTime(d.lastSeenAt, now) }}
                <Badge v-if="isOffline(d.lastSeenAt, now)" variant="secondary">Offline</Badge>
              </template>
            </dd>
            <template v-if="!d.revokedAt">
              <dt class="text-muted-foreground">Kid mode</dt>
              <dd>
                <DeviceKidControl
                  :device="d"
                  :pihole-connected="piholeConnected"
                  :busy="busyId === d.id"
                  @toggle="toggleKid(d, $event)"
                />
              </dd>
            </template>
            <dt class="text-muted-foreground">Blocked by Pi-hole</dt>
            <dd class="font-mono">{{ blocked(d) }}</dd>
          </dl>
        </li>
      </ul>

      <p class="text-muted-foreground text-sm">
        Pi-hole’s own count for this IP. Hush’s hidden-post counts stay on the device.
      </p>
    </div>

    <PairDeviceDialog :open="pairOpen" :profile-id="pairProfile" @update:open="setPairOpen" />
    <DeviceActionDialog :device="actionDevice" :action="action" @close="action = null" />
  </TooltipProvider>
</template>
