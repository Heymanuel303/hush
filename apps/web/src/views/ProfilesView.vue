<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Lock, Plus, UserRound } from '@lucide/vue'
import type { ProfileWithRules } from 'contracts'
import { relativeTime } from '@/lib/utils'
import { useProfilesStore } from '@/stores/profiles'
import PageHeader from '@/components/layout/PageHeader.vue'
import CreateProfileDialog from '@/components/profiles/CreateProfileDialog.vue'
import EmptyState from '@/components/state/EmptyState.vue'
import ErrorState from '@/components/state/ErrorState.vue'
import LoadingState from '@/components/state/LoadingState.vue'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const store = useProfilesStore()
const creating = ref(false)

onMounted(() => void store.load())

const wordCount = (p: ProfileWithRules) =>
  p.rules.blockWords.length +
  Object.values(p.rules.siteWords).reduce((sum, words) => sum + (words?.length ?? 0), 0)
</script>

<template>
  <PageHeader title="Profiles" description="Each profile is one set of rules that browsers pull.">
    <Button @click="creating = true"><Plus aria-hidden="true" />New profile</Button>
  </PageHeader>

  <LoadingState
    v-if="store.status === 'loading' || store.status === 'idle'"
    :rows="4"
    label="Loading profiles"
  />
  <ErrorState v-else-if="store.status === 'error'" :message="store.error ?? ''">
    <template #retry>
      <Button variant="outline" size="sm" @click="store.load()">Retry</Button>
    </template>
  </ErrorState>
  <EmptyState
    v-else-if="!store.profiles.length"
    :icon="UserRound"
    title="No profiles yet"
    description="A profile holds the words, packs and hours for one person."
  >
    <template #action>
      <Button @click="creating = true">Create your first profile</Button>
    </template>
  </EmptyState>
  <div v-else class="rounded-lg border">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead class="px-3">Name</TableHead>
          <TableHead class="px-3">Lock</TableHead>
          <TableHead class="px-3">Packs</TableHead>
          <TableHead class="px-3">Words</TableHead>
          <TableHead class="px-3">Updated</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-for="p in store.profiles" :key="p.id" class="h-10">
          <TableCell class="max-w-40 truncate px-3 font-medium sm:max-w-none">
            <RouterLink
              :to="{ name: 'profile', params: { id: p.id } }"
              class="focus-visible:ring-ring/50 rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3"
            >
              {{ p.name }}
            </RouterLink>
          </TableCell>
          <TableCell class="px-3">
            <Lock v-if="p.locked" class="size-4" role="img" aria-label="Locked" />
            <span v-else class="sr-only">Not locked</span>
          </TableCell>
          <TableCell class="px-3 tabular-nums">{{ p.rules.enabledPacks.length }}</TableCell>
          <TableCell class="px-3 tabular-nums">{{ wordCount(p) }}</TableCell>
          <TableCell class="text-muted-foreground px-3 whitespace-nowrap">
            {{ relativeTime(p.updatedAt) }}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>

  <CreateProfileDialog v-model:open="creating" />
</template>
