<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { LoaderCircle, Lock, Pencil, SearchX, Trash2 } from '@lucide/vue'
import { CAPS, RuleSet, SITE_IDS } from 'contracts'
import type { ProfileWithRules, SiteId } from 'contracts'
import { ApiError } from '@/lib/api'
import { useProfilesStore } from '@/stores/profiles'
import { usePacksStore } from '@/stores/packs'
import PageHeader from '@/components/layout/PageHeader.vue'
import ScheduleEditor from '@/components/schedule/ScheduleEditor.vue'
import EmptyState from '@/components/state/EmptyState.vue'
import ErrorState from '@/components/state/ErrorState.vue'
import LoadingState from '@/components/state/LoadingState.vue'
import WordListEditor from '@/components/words/WordListEditor.vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const route = useRoute()
const router = useRouter()
const store = useProfilesStore()
const packsStore = usePacksStore()

type LoadState = 'loading' | 'ready' | 'error' | 'notfound'
const loadState = ref<LoadState>('loading')
const loadError = ref('')
const draft = ref<RuleSet | null>(null)
const saving = ref(false)
const stale = ref(false)
const saveError = ref('')

const id = computed(() => String(route.params.id))
const profile = computed<ProfileWithRules | undefined>(() =>
  store.profiles.find((p) => p.id === id.value),
)
const snapshot = (rules: RuleSet) => JSON.stringify(rules)
const dirty = computed(
  () => !!profile.value && !!draft.value && snapshot(draft.value) !== snapshot(profile.value.rules),
)
// Rejected locally for what the contract would reject (an empty or equal-ended window).
const invalid = computed(() => !!draft.value && !RuleSet.safeParse(draft.value).success)

function resetDraft(p: ProfileWithRules) {
  draft.value = structuredClone(p.rules)
  stale.value = false
  saveError.value = ''
}

async function load() {
  loadState.value = 'loading'
  loadError.value = ''
  try {
    resetDraft(await store.fetchOne(id.value))
    loadState.value = 'ready'
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) loadState.value = 'notfound'
    else {
      loadError.value = e instanceof ApiError ? e.message : 'The profile could not be loaded.'
      loadState.value = 'error'
    }
  }
}

onMounted(() => {
  void load()
  if (packsStore.status === 'idle' || packsStore.status === 'error') void packsStore.load()
})
watch(id, () => void load())

// ---- Words, packs, sites ----
const packRows = computed(() => [
  ...packsStore.packs.filter((p) => p.builtIn),
  ...packsStore.packs.filter((p) => !p.builtIn),
])

function setPack(name: string, on: boolean) {
  if (!draft.value) return
  const rest = draft.value.enabledPacks.filter((n) => n !== name)
  draft.value.enabledPacks = on ? [...rest, name] : rest
}

const SITE_LABELS: Record<SiteId, string> = {
  Reddit: 'Reddit',
  X: 'X',
  YouTube: 'YouTube',
  Google: 'Google',
}

function siteWords(site: SiteId): string[] {
  return draft.value?.siteWords[site] ?? []
}
function setSiteWords(site: SiteId, words: string[]) {
  if (!draft.value) return
  const next = { ...draft.value.siteWords }
  if (words.length) next[site] = words
  else delete next[site]
  draft.value.siteWords = next
}

function setYtRedirect(on: boolean) {
  if (draft.value) draft.value.siteOptions = { ...draft.value.siteOptions, ytHomeRedirect: on }
}

// ---- Save / discard ----
async function save() {
  const p = profile.value
  if (!p || !draft.value || saving.value) return
  saving.value = true
  saveError.value = ''
  try {
    resetDraft(await store.putRules(p.id, p.version, draft.value))
    toast.success('Saved.')
  } catch (e) {
    if (!(e instanceof ApiError)) throw e
    if (e.status === 412) stale.value = true
    else saveError.value = e.message
  } finally {
    saving.value = false
  }
}

function discard() {
  if (profile.value) resetDraft(profile.value)
}

// ---- Immediate saves through PATCH ----
const lockError = ref('')
async function setLocked(locked: boolean) {
  const p = profile.value
  if (!p) return
  lockError.value = ''
  try {
    await store.patch(p.id, { locked })
  } catch (e) {
    lockError.value = e instanceof ApiError ? e.message : 'The change could not be saved.'
  }
}

const renaming = ref(false)
const newName = ref('')
const renameError = ref('')
const renameBusy = ref(false)

function openRename() {
  newName.value = profile.value?.name ?? ''
  renameError.value = ''
  renaming.value = true
}

async function rename() {
  const p = profile.value
  const trimmed = newName.value.trim()
  if (!p) return
  if (!trimmed) {
    renameError.value = 'Give the profile a name.'
    return
  }
  renameBusy.value = true
  try {
    await store.patch(p.id, { name: trimmed })
    renaming.value = false
  } catch (e) {
    renameError.value = e instanceof ApiError ? e.message : 'The name could not be saved.'
  } finally {
    renameBusy.value = false
  }
}

// ---- Delete ----
const deleting = ref(false)
const deleteBusy = ref(false)
const deleteError = ref<ApiError | null>(null)

function openDelete() {
  deleteError.value = null
  deleting.value = true
}

async function confirmDelete() {
  const p = profile.value
  if (!p) return
  deleteBusy.value = true
  deleteError.value = null
  try {
    await store.remove(p.id)
    toast.success(`Deleted “${p.name}”.`)
    deleting.value = false
    await router.push({ name: 'profiles' })
  } catch (e) {
    if (!(e instanceof ApiError)) throw e
    deleteError.value = e
  } finally {
    deleteBusy.value = false
  }
}
</script>

<template>
  <LoadingState v-if="loadState === 'loading'" :rows="5" label="Loading profile" />
  <ErrorState v-else-if="loadState === 'error'" :message="loadError">
    <template #retry>
      <Button variant="outline" size="sm" @click="load()">Retry</Button>
    </template>
  </ErrorState>
  <EmptyState
    v-else-if="loadState === 'notfound' || !profile || !draft"
    :icon="SearchX"
    title="Profile not found"
    description="It may have been deleted from another browser."
  >
    <template #action>
      <Button as-child variant="outline">
        <RouterLink :to="{ name: 'profiles' }">Back to profiles</RouterLink>
      </Button>
    </template>
  </EmptyState>

  <div v-else class="flex flex-col">
    <PageHeader :title="profile.name">
      <span class="text-muted-foreground font-mono text-xs" data-testid="version">
        v{{ profile.version }}
      </span>
      <Button variant="outline" @click="openRename">
        <Pencil aria-hidden="true" />Rename
      </Button>
      <Button variant="outline" @click="openDelete">
        <Trash2 aria-hidden="true" />Delete
      </Button>
    </PageHeader>

    <Alert v-if="stale" variant="destructive" role="alert" class="mb-6">
      <AlertTitle>This profile was changed elsewhere</AlertTitle>
      <AlertDescription>
        <p>Your edits were not saved. Reload to see the current version; your local edits are dropped.</p>
        <div class="pt-2">
          <Button variant="outline" size="sm" @click="load()">Reload</Button>
        </div>
      </AlertDescription>
    </Alert>

    <Tabs default-value="words" class="min-w-0 flex-col gap-4">
      <div class="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <TabsList>
          <TabsTrigger value="words">Words</TabsTrigger>
          <TabsTrigger value="packs">Packs</TabsTrigger>
          <TabsTrigger value="sites">Sites</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="lock">
            <Lock v-if="profile.locked" class="size-3.5" aria-hidden="true" />Lock
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="words" class="flex flex-col gap-3">
        <p class="text-muted-foreground text-sm">
          Start a word with = to match it only as a whole word, the way the Hush popup does.
        </p>
        <WordListEditor v-model="draft.blockWords" :max="CAPS.maxWords" />
      </TabsContent>

      <TabsContent value="packs" class="flex flex-col gap-3">
        <LoadingState v-if="packsStore.status === 'loading' || packsStore.status === 'idle'" :rows="4" label="Loading packs" />
        <ErrorState v-else-if="packsStore.status === 'error'" :message="packsStore.error ?? ''">
          <template #retry>
            <Button variant="outline" size="sm" @click="packsStore.load()">Retry</Button>
          </template>
        </ErrorState>
        <p v-else-if="!packRows.length" class="text-muted-foreground text-sm">No packs exist yet.</p>
        <ul v-else class="divide-y rounded-lg border" aria-label="Packs">
          <li v-for="pack in packRows" :key="pack.id" class="flex min-h-10 items-center gap-3 px-3">
            <Label :for="`pack-${pack.id}`" class="min-w-0 flex-1 truncate py-2 font-normal">
              {{ pack.name }}
              <span class="text-muted-foreground ml-2 tabular-nums">{{ pack.words.length }} words</span>
            </Label>
            <Badge :variant="pack.builtIn ? 'secondary' : 'outline'">
              {{ pack.builtIn ? 'Built in' : 'Household' }}
            </Badge>
            <Switch
              :id="`pack-${pack.id}`"
              :model-value="draft.enabledPacks.includes(pack.name)"
              @update:model-value="(on) => setPack(pack.name, on === true)"
            />
          </li>
        </ul>
      </TabsContent>

      <TabsContent value="sites" class="grid gap-4 lg:grid-cols-2">
        <Card v-for="site in SITE_IDS" :key="site" class="gap-4 py-4">
          <CardHeader class="px-4">
            <CardTitle class="text-base">{{ SITE_LABELS[site] }}</CardTitle>
          </CardHeader>
          <CardContent class="flex flex-col gap-4 px-4">
            <div v-if="site === 'YouTube'" class="flex items-center gap-3">
              <Switch
                id="opt-ytHomeRedirect"
                :model-value="draft.siteOptions.ytHomeRedirect === true"
                @update:model-value="(on) => setYtRedirect(on === true)"
              />
              <Label for="opt-ytHomeRedirect" class="font-normal">
                Open Subscriptions instead of the home page
              </Label>
            </div>
            <WordListEditor
              :model-value="siteWords(site)"
              :max="CAPS.maxSiteWords"
              :label="`Add a ${SITE_LABELS[site]} word`"
              @update:model-value="(w) => setSiteWords(site, w)"
            />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="schedule">
        <ScheduleEditor v-model="draft.quietHours" />
      </TabsContent>

      <TabsContent value="lock" class="flex flex-col gap-3">
        <div class="flex items-center gap-3">
          <Switch
            id="profile-lock"
            :model-value="profile.locked"
            @update:model-value="(on) => setLocked(on === true)"
          />
          <Label for="profile-lock">Locked</Label>
        </div>
        <p class="text-muted-foreground max-w-prose text-sm">
          On a locked profile the Hush popup is read-only and shows Managed by this hub. Hush can
          still be removed from a device that is not force-installed by a browser policy.
        </p>
        <p v-if="lockError" role="alert" class="text-destructive text-sm">{{ lockError }}</p>
      </TabsContent>
    </Tabs>

    <div
      v-if="dirty || saveError"
      class="bg-background sticky bottom-0 z-10 mt-6 -mx-4 flex flex-wrap items-center gap-3 border-t px-4 py-3 sm:mx-0"
    >
      <p class="text-sm font-medium">Unsaved changes</p>
      <p v-if="saveError" role="alert" class="text-destructive min-w-0 text-sm">{{ saveError }}</p>
      <p v-else-if="invalid" class="text-muted-foreground text-sm">
        Fix the schedule before saving.
      </p>
      <div class="ml-auto flex gap-2">
        <Button variant="outline" :disabled="saving" @click="discard">Discard</Button>
        <Button :disabled="saving || invalid || stale" @click="save">
          <LoaderCircle v-if="saving" class="animate-spin" aria-hidden="true" />
          Save
        </Button>
      </div>
    </div>
  </div>

  <Dialog v-model:open="renaming">
    <DialogContent class="grid-cols-1">
      <DialogHeader>
        <DialogTitle>Rename profile</DialogTitle>
        <DialogDescription>The name is only shown in this console.</DialogDescription>
      </DialogHeader>
      <form class="flex flex-col gap-4" novalidate @submit.prevent="rename">
        <div class="flex flex-col gap-1.5">
          <Label for="rename-input">Name</Label>
          <Input
            id="rename-input"
            v-model="newName"
            :maxlength="CAPS.maxNameLength"
            :aria-invalid="renameError ? true : undefined"
            autocomplete="off"
          />
          <p v-if="renameError" role="alert" class="text-destructive text-sm">{{ renameError }}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" @click="renaming = false">Cancel</Button>
          <Button type="submit" :disabled="renameBusy">Save name</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>

  <Dialog v-model:open="deleting">
    <DialogContent class="grid-cols-1">
      <DialogHeader>
        <DialogTitle>Delete “{{ profile?.name }}”?</DialogTitle>
        <DialogDescription>Its words, packs and schedule are removed.</DialogDescription>
      </DialogHeader>
      <div v-if="deleteError" role="alert" class="text-destructive text-sm">
        <p>{{ deleteError.message }}</p>
        <p v-if="deleteError.error === 'profile_in_use'" class="pt-1">
          Move or revoke its devices first:
          <RouterLink to="/devices" class="underline underline-offset-4">go to Devices</RouterLink>.
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="deleting = false">Cancel</Button>
        <Button variant="destructive" :disabled="deleteBusy" @click="confirmDelete">
          <LoaderCircle v-if="deleteBusy" class="animate-spin" aria-hidden="true" />
          Delete profile
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
