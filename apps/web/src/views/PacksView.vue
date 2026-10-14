<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import { Ellipsis, LoaderCircle, Package, Plus } from '@lucide/vue'
import type { Pack } from 'contracts'
import { ApiError } from '@/lib/api'
import { usePacksStore } from '@/stores/packs'
import PageHeader from '@/components/layout/PageHeader.vue'
import EmptyState from '@/components/state/EmptyState.vue'
import ErrorState from '@/components/state/ErrorState.vue'
import LoadingState from '@/components/state/LoadingState.vue'
import PackEditorDialog from '@/components/packs/PackEditorDialog.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

const store = usePacksStore()

const editorOpen = ref(false)
const editing = ref<Pack | null>(null)
const deleting = ref<Pack | null>(null)
const deletingBusy = ref(false)

const household = computed(() => store.packs.filter((p) => !p.builtIn))
// Household packs first: they are the ones this screen edits.
const rows = computed(() => [...household.value, ...store.packs.filter((p) => p.builtIn)])

onMounted(() => void store.load())

function openNew() {
  editing.value = null
  editorOpen.value = true
}

function openEdit(pack: Pack) {
  editing.value = pack
  editorOpen.value = true
}

const preview = (pack: Pack) =>
  pack.words
    .slice(0, 3)
    .map((w) => (w.startsWith('=') ? w.slice(1) : w))
    .join(', ') + (pack.words.length > 3 ? '…' : '')

async function confirmDelete() {
  const pack = deleting.value
  if (!pack) return
  deletingBusy.value = true
  try {
    await store.remove(pack.id)
    toast.success(`Deleted “${pack.name}”.`)
    deleting.value = null
  } catch (e) {
    toast.error(e instanceof ApiError ? e.message : 'The pack could not be deleted.')
  } finally {
    deletingBusy.value = false
  }
}
</script>

<template>
  <PageHeader
    title="Packs"
    description="A pack is a named set of words. Profiles switch packs on; the built-in ones are read-only."
  >
    <Button @click="openNew"><Plus aria-hidden="true" />New pack</Button>
  </PageHeader>

  <LoadingState
    v-if="store.status === 'loading' || store.status === 'idle'"
    :rows="6"
    label="Loading packs"
  />
  <ErrorState v-else-if="store.status === 'error'" :message="store.error ?? ''">
    <template #retry>
      <Button variant="outline" size="sm" @click="store.load()">Retry</Button>
    </template>
  </ErrorState>
  <div v-else class="flex flex-col gap-4">
    <EmptyState
      v-if="!household.length"
      :icon="Package"
      title="No household packs yet"
      description="Create one to share a set of words across profiles."
    />
    <TooltipProvider>
      <div class="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="px-3">Name</TableHead>
              <TableHead class="px-3">Words</TableHead>
              <TableHead class="px-3">Kind</TableHead>
              <TableHead class="w-12 px-3"><span class="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="pack in rows" :key="pack.id" class="h-10">
              <TableCell class="max-w-40 truncate px-3 font-medium sm:max-w-none">
                {{ pack.name }}
              </TableCell>
              <TableCell class="max-w-24 truncate px-3 sm:max-w-80">
                <span class="tabular-nums">{{ pack.words.length }}</span>
                <span class="text-muted-foreground ml-2 hidden sm:inline">{{ preview(pack) }}</span>
              </TableCell>
              <TableCell class="px-3">
                <Badge :variant="pack.builtIn ? 'secondary' : 'outline'">
                  {{ pack.builtIn ? 'Built in' : 'Household' }}
                </Badge>
              </TableCell>
              <TableCell class="px-3 text-right">
                <Tooltip v-if="pack.builtIn">
                  <TooltipTrigger as-child>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-disabled="true"
                      class="opacity-50"
                      :aria-label="`Actions for ${pack.name}`"
                    >
                      <Ellipsis aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Built-in packs are read-only.</TooltipContent>
                </Tooltip>
                <DropdownMenu v-else>
                  <DropdownMenuTrigger as-child>
                    <Button variant="ghost" size="icon-sm" :aria-label="`Actions for ${pack.name}`">
                      <Ellipsis aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem @select="openEdit(pack)">Edit</DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" @select="deleting = pack">
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  </div>

  <PackEditorDialog v-model:open="editorOpen" :pack="editing" />

  <Dialog :open="deleting !== null" @update:open="(o) => !o && (deleting = null)">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Delete “{{ deleting?.name }}”?</DialogTitle>
        <DialogDescription>
          Profiles that enable this pack stop using it; their devices update on the next pull.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" @click="deleting = null">Cancel</Button>
        <Button variant="destructive" :disabled="deletingBusy" @click="confirmDelete">
          <LoaderCircle v-if="deletingBusy" class="animate-spin" aria-hidden="true" />
          Delete pack
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
