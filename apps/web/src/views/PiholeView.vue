<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Unplug } from '@lucide/vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import PiholeConnectionForm from '@/components/pihole/PiholeConnectionForm.vue'
import EmptyState from '@/components/state/EmptyState.vue'
import ErrorState from '@/components/state/ErrorState.vue'
import LoadingState from '@/components/state/LoadingState.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ApiError } from '@/lib/api'
import { usePiholeStore } from '@/stores/pihole'

const store = usePiholeStore()
const formatNumber = (n: number) => new Intl.NumberFormat().format(n)
const confirmOpen = ref(false)
const disconnecting = ref(false)
const disconnectError = ref<string | null>(null)

const connected = computed(() => store.connection !== null)
const lastChecked = computed(() => {
  const at = store.connection?.lastCheckedAt
  return at ? new Date(at).toLocaleString() : 'Not yet'
})

async function init() {
  await store.load()
  if (store.connection) await store.loadSummary()
}

async function disconnect() {
  disconnecting.value = true
  disconnectError.value = null
  try {
    await store.disconnect()
    confirmOpen.value = false
  } catch (e) {
    disconnectError.value = e instanceof ApiError ? e.message : 'Could not disconnect. Try again.'
  } finally {
    disconnecting.value = false
  }
}

onMounted(init)
</script>

<template>
  <PageHeader
    title="Pi-hole"
    description="Pi-hole blocks whole sites on the network; Hush quiets the feeds inside the browser."
  />

  <LoadingState v-if="store.status === 'idle' || store.status === 'loading'" label="Loading Pi-hole" :rows="3" />

  <ErrorState v-else-if="store.status === 'error'" :message="store.error ?? 'Could not load the Pi-hole connection.'">
    <template #retry>
      <Button variant="outline" size="sm" @click="init">Try again</Button>
    </template>
  </ErrorState>

  <div v-else class="flex flex-col gap-6">
    <EmptyState
      v-if="!connected"
      :icon="Unplug"
      title="Not connected"
      description="Add your Pi-hole’s address and an app password so the hub can move devices into the Kid group."
    />

    <Card v-else>
      <CardHeader>
        <CardTitle>Connection</CardTitle>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <dl class="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
          <dt class="text-muted-foreground">URL</dt>
          <dd class="font-mono break-all">{{ store.connection?.url }}</dd>
          <dt class="text-muted-foreground">Kid group</dt>
          <dd>{{ store.connection?.kidGroupName }}</dd>
          <dt class="text-muted-foreground">Last checked</dt>
          <dd>{{ lastChecked }}</dd>
          <template v-if="store.connection?.lastError">
            <dt class="text-muted-foreground">Last error</dt>
            <dd class="text-destructive break-words">{{ store.connection.lastError }}</dd>
          </template>
        </dl>
        <div>
          <Button variant="outline" @click="confirmOpen = true">Disconnect</Button>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>{{ connected ? 'Connection settings' : 'Connect Pi-hole' }}</CardTitle>
      </CardHeader>
      <CardContent class="max-w-xl">
        <PiholeConnectionForm />
      </CardContent>
    </Card>

    <Card v-if="connected">
      <CardHeader>
        <CardTitle>Pi-hole traffic</CardTitle>
        <CardDescription>Pi-hole’s own counts. Hush never reports what it hides.</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <ErrorState
          v-if="store.summaryError"
          title="Could not load the summary"
          :message="store.summaryError"
        >
          <template #retry>
            <Button variant="outline" size="sm" @click="store.loadSummary()">Try again</Button>
          </template>
        </ErrorState>
        <LoadingState v-else-if="!store.summary" label="Loading summary" :rows="3" />
        <template v-else>
          <dl class="grid grid-cols-3 gap-4 text-sm">
            <div>
              <dt class="text-muted-foreground">Queries</dt>
              <dd class="font-mono text-lg font-semibold">{{ formatNumber(store.summary.queries.total) }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Blocked</dt>
              <dd class="font-mono text-lg font-semibold">{{ formatNumber(store.summary.queries.blocked) }}</dd>
            </div>
            <div>
              <dt class="text-muted-foreground">Share</dt>
              <dd class="font-mono text-lg font-semibold">
                {{ store.summary.queries.percentBlocked.toFixed(1) }}%
              </dd>
            </div>
          </dl>
          <p v-if="store.summary.topClients.length === 0" class="text-muted-foreground text-sm">
            No blocked queries from any client yet.
          </p>
          <Table v-else>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Name</TableHead>
                <TableHead class="text-right">Blocked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="c in store.summary.topClients" :key="c.ip" class="h-10">
                <TableCell class="font-mono">{{ c.ip }}</TableCell>
                <TableCell class="max-w-40 truncate">{{ c.name ?? '—' }}</TableCell>
                <TableCell class="text-right font-mono">{{ formatNumber(c.blocked) }}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </template>
      </CardContent>
    </Card>
  </div>

  <Dialog v-model:open="confirmOpen">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Disconnect Pi-hole?</DialogTitle>
        <DialogDescription>
          The hub forgets the address and the stored password. Kid mode stops working until you
          connect again.
        </DialogDescription>
      </DialogHeader>
      <p v-if="disconnectError" role="alert" class="text-destructive text-sm">{{ disconnectError }}</p>
      <DialogFooter>
        <Button variant="outline" @click="confirmOpen = false">Cancel</Button>
        <Button :disabled="disconnecting" @click="disconnect">
          {{ disconnecting ? 'Disconnecting…' : 'Disconnect' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
