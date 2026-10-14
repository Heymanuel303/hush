<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { ProfileWithRules } from 'contracts'
import PageHeader from '@/components/layout/PageHeader.vue'
import PairDevicePanel from '@/components/devices/PairDevicePanel.vue'
import PiholeConnectionForm from '@/components/pihole/PiholeConnectionForm.vue'
import CreateProfileForm from '@/components/profiles/CreateProfileForm.vue'
import ErrorState from '@/components/state/ErrorState.vue'
import LoadingState from '@/components/state/LoadingState.vue'
import { Button } from '@/components/ui/button'
import { useHubStore } from '@/stores/hub'
import { usePiholeStore } from '@/stores/pihole'

// The wizard writes nothing itself: each step is a component that talks to its own store.
const STEPS = [
  { id: 'pihole', label: 'Pi-hole' },
  { id: 'profile', label: 'First profile' },
  { id: 'pair', label: 'Pair a device' },
  { id: 'done', label: 'Done' },
] as const
type StepId = (typeof STEPS)[number]['id']

const NEXT = [
  'Edit the profile; devices pull changes within 15 minutes.',
  'Lock a profile to make the popup read-only.',
  'Kid mode needs the device’s Tailscale IP and a Kid group in Pi-hole.',
]

const pihole = usePiholeStore()
const hub = useHubStore()

const step = ref<StepId>('pihole')
const created = ref<ProfileWithRules | null>(null)
const index = computed(() => STEPS.findIndex((s) => s.id === step.value))

async function loadPihole() {
  await pihole.load()
  // Done when a connection already exists (a re-run of the guide, or connected on the Pi-hole screen).
  if (pihole.status === 'ready' && pihole.connection) step.value = 'profile'
}

async function profileCreated(profile: ProfileWithRules) {
  created.value = profile
  step.value = 'pair'
  try {
    await hub.refresh()
  } catch {
    // The redirect rule re-reads the status when it needs it.
  }
}

onMounted(loadPihole)
</script>

<template>
  <div class="mx-auto flex w-full max-w-160 flex-col gap-6">
    <PageHeader title="Set up Hush" description="Connect Pi-hole, make a profile, pair a browser." />

    <nav aria-label="Setup progress">
      <ol class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <li
          v-for="(s, i) in STEPS"
          :key="s.id"
          :aria-current="s.id === step ? 'step' : undefined"
          :class="s.id === step ? 'text-primary font-semibold' : 'text-muted-foreground'"
        >
          {{ i + 1 }}. {{ s.label }}<span v-if="i < index" class="sr-only"> (finished)</span>
        </li>
      </ol>
    </nav>

    <section v-if="step === 'pihole'" aria-labelledby="step-pihole" class="flex flex-col gap-4">
      <div>
        <h2 id="step-pihole" class="text-lg font-semibold">Connect Pi-hole</h2>
        <p class="text-muted-foreground text-sm">
          Optional. Kid mode needs it to move a device into the Kid group; profiles work without it.
        </p>
      </div>
      <LoadingState v-if="pihole.status === 'idle' || pihole.status === 'loading'" :rows="3" label="Loading the Pi-hole connection" />
      <ErrorState v-else-if="pihole.status === 'error'" :message="pihole.error ?? 'The connection could not be read.'">
        <template #retry>
          <Button variant="outline" size="sm" @click="loadPihole">Try again</Button>
        </template>
      </ErrorState>
      <template v-else>
        <PiholeConnectionForm @saved="step = 'profile'" />
        <p>
          <Button variant="link" class="h-auto p-0" @click="step = 'profile'">Skip for now</Button>
        </p>
      </template>
    </section>

    <section v-else-if="step === 'profile'" aria-labelledby="step-profile" class="flex flex-col gap-4">
      <div>
        <h2 id="step-profile" class="text-lg font-semibold">Create the first profile</h2>
        <p class="text-muted-foreground text-sm">
          A profile is the set of words and rules a browser follows. Start from a template or from nothing.
        </p>
      </div>
      <CreateProfileForm :cancelable="false" @created="profileCreated" />
    </section>

    <section v-else-if="step === 'pair' && created" aria-labelledby="step-pair" class="flex flex-col gap-4">
      <h2 id="step-pair" class="text-lg font-semibold">Pair a device</h2>
      <PairDevicePanel :profile-id="created.id" :cancelable="false" @done="step = 'done'" />
      <p>
        <Button variant="link" class="h-auto p-0" @click="step = 'done'">I’ll do this later</Button>
      </p>
    </section>

    <section v-else aria-labelledby="step-done" class="flex flex-col gap-4">
      <h2 id="step-done" class="text-lg font-semibold">Setup finished</h2>
      <ul class="flex list-disc flex-col gap-2 pl-5 text-sm">
        <li v-for="line in NEXT" :key="line">{{ line }}</li>
      </ul>
      <div>
        <Button as-child><RouterLink to="/devices">Go to Devices</RouterLink></Button>
      </div>
    </section>
  </div>
</template>
