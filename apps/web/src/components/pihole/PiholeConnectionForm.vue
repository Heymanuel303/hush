<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ChevronDown, CircleAlert } from '@lucide/vue'
import type { PiholeConnectionPut, PiholeTestResult } from 'contracts'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import { usePiholeStore } from '@/stores/pihole'

const emit = defineEmits<{ saved: [] }>()

const store = usePiholeStore()

const url = ref(store.connection?.url ?? '')
const appPassword = ref('')
const kidGroupName = ref(store.connection?.kidGroupName ?? 'Kid')
const busy = ref<'test' | 'save' | null>(null)
const result = ref<PiholeTestResult | null>(null)
const failure = ref<string | null>(null)
const helpOpen = ref(false)

// The connection arrives after the first render on a reload: prefill once it does. Later
// replacements (a test re-reads it) must not overwrite what the user is typing.
watch(
  () => store.connection,
  (c, before) => {
    if (!c || before) return
    url.value = c.url
    kidGroupName.value = c.kidGroupName
  },
)

const hasStored = computed(() => store.connection?.hasSecret === true)
const complete = computed(
  () =>
    url.value.trim() !== '' &&
    kidGroupName.value.trim() !== '' &&
    (hasStored.value || appPassword.value !== ''),
)

/** `appPassword` is sent only when the field is filled; omitted means keep the stored one. */
function payload(): PiholeConnectionPut {
  const body: PiholeConnectionPut = {
    url: url.value.trim(),
    kidGroupName: kidGroupName.value.trim(),
  }
  if (appPassword.value !== '') body.appPassword = appPassword.value
  return body
}

async function run(kind: 'test' | 'save') {
  if (busy.value || !complete.value) return
  busy.value = kind
  failure.value = null
  try {
    if (kind === 'test') {
      result.value = await store.test(payload())
    } else {
      await store.save(payload())
      appPassword.value = ''
      emit('saved')
    }
  } catch (e) {
    result.value = null
    failure.value = e instanceof ApiError ? e.message : 'Something went wrong. Try again.'
  } finally {
    busy.value = null
  }
}

const kidPresent = computed(
  () => result.value?.groups?.some((g) => g.name === kidGroupName.value.trim()) ?? false,
)

// The api's message already says what to do (it names webserver.api.max_sessions when Pi-hole is out of sessions).
const errorText = computed(() => result.value?.error ?? null)
</script>

<template>
  <form class="flex flex-col gap-4" novalidate @submit.prevent="run('save')">
    <div class="flex flex-col gap-2">
      <Label for="pihole-url">URL</Label>
      <Input
        id="pihole-url"
        v-model="url"
        type="url"
        inputmode="url"
        autocomplete="off"
        placeholder="http://192.168.1.11:8070 or http://pihole.<tailnet>.ts.net"
        class="font-mono"
      />
    </div>
    <div class="flex flex-col gap-2">
      <Label for="pihole-password">App password</Label>
      <Input
        id="pihole-password"
        v-model="appPassword"
        type="password"
        autocomplete="new-password"
        :placeholder="hasStored ? 'Leave empty to keep the stored password' : ''"
      />
    </div>
    <div class="flex flex-col gap-2">
      <Label for="pihole-kid">Kid group name</Label>
      <Input id="pihole-kid" v-model="kidGroupName" autocomplete="off" />
    </div>

    <div class="flex flex-wrap gap-2">
      <Button type="button" variant="outline" :disabled="!complete || busy !== null" @click="run('test')">
        {{ busy === 'test' ? 'Testing…' : 'Test connection' }}
      </Button>
      <Button type="submit" :disabled="!complete || busy !== null">
        {{ busy === 'save' ? 'Saving…' : 'Save' }}
      </Button>
    </div>

    <div aria-live="polite" class="flex flex-col gap-3">
      <Alert v-if="failure" variant="destructive">
        <CircleAlert />
        <AlertTitle>Could not complete the request</AlertTitle>
        <AlertDescription>{{ failure }}</AlertDescription>
      </Alert>
      <Alert v-else-if="result && !result.ok" variant="destructive">
        <CircleAlert />
        <AlertTitle>Connection failed</AlertTitle>
        <AlertDescription>{{ errorText ?? 'The test did not succeed.' }}</AlertDescription>
      </Alert>
      <div v-else-if="result" class="flex flex-col gap-2 rounded-md border p-3 text-sm">
        <p>
          Connected to Pi-hole <span class="font-mono">{{ result.version }}</span>
        </p>
        <ul class="flex flex-wrap gap-2" aria-label="Groups">
          <li v-for="g in result.groups ?? []" :key="g.id">
            <Badge :variant="g.name === kidGroupName.trim() ? 'default' : 'outline'">{{ g.name }}</Badge>
          </li>
        </ul>
        <p v-if="!kidPresent" class="text-muted-foreground">
          No group named “{{ kidGroupName.trim() }}” yet. Create it in Pi-hole’s Group management.
        </p>
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <button
        type="button"
        class="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex w-fit items-center gap-1 rounded-md text-sm outline-none focus-visible:ring-3"
        :aria-expanded="helpOpen"
        aria-controls="pihole-help"
        @click="helpOpen = !helpOpen"
      >
        <ChevronDown class="size-4 transition-transform" :class="{ '-rotate-90': !helpOpen }" aria-hidden="true" />
        Where do I find these?
      </button>
      <Card v-show="helpOpen" id="pihole-help">
        <CardContent class="flex flex-col gap-2 text-sm">
          <p>
            Create an app password in Pi-hole under Settings, Web interface/API, Configure app
            password.
          </p>
          <p>
            The hub needs an <span class="font-mono">http://</span> URL or a certificate it
            trusts. Self-signed HTTPS needs
            <span class="font-mono">PIHOLE_TLS_INSECURE=true</span> in the hub’s
            <span class="font-mono">.env</span>.
          </p>
          <p>
            The Kid group and its lists are created in Pi-hole’s Group management; see
            <a
              class="underline underline-offset-2"
              href="https://github.com/Heymanuel303/hush/blob/main/infra/pihole/blocklists.md"
              target="_blank"
              rel="noreferrer"
              >infra/pihole/blocklists.md</a
            >
            in the repository.
          </p>
        </CardContent>
      </Card>
    </div>
  </form>
</template>
