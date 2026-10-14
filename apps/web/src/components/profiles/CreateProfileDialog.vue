<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { LoaderCircle } from '@lucide/vue'
import { useRouter } from 'vue-router'
import { CAPS, TemplateId } from 'contracts'
import { ApiError } from '@/lib/api'
import { useProfilesStore } from '@/stores/profiles'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()

const EMPTY = 'empty'
const store = useProfilesStore()
const router = useRouter()

const name = ref('')
const choice = ref<string>(EMPTY)
const locked = ref(false)
const nameError = ref('')
const formError = ref('')
const loadError = ref('')
const saving = ref(false)

const template = computed(() => store.templates.find((t) => t.id === choice.value))

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    name.value = ''
    choice.value = EMPTY
    locked.value = false
    nameError.value = ''
    formError.value = ''
    loadError.value = ''
    try {
      await store.loadTemplates()
    } catch (e) {
      loadError.value = e instanceof ApiError ? e.message : 'Templates could not be loaded.'
    }
  },
  { immediate: true },
)

watch(choice, () => {
  locked.value = template.value?.locked ?? false
})

async function submit() {
  nameError.value = ''
  formError.value = ''
  const trimmed = name.value.trim()
  if (!trimmed) {
    nameError.value = 'Give the profile a name.'
    return
  }
  saving.value = true
  try {
    const parsed = TemplateId.safeParse(choice.value)
    const profile = await store.create({
      name: trimmed,
      ...(parsed.success ? { templateId: parsed.data } : {}),
      locked: locked.value,
    })
    emit('update:open', false)
    await router.push({ name: 'profile', params: { id: profile.id } })
  } catch (e) {
    if (!(e instanceof ApiError)) throw e
    if (e.error === 'name_taken' || e.status === 400) nameError.value = e.message
    else formError.value = e.message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="grid-cols-1 sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>New profile</DialogTitle>
        <DialogDescription>
          Start from a template or from nothing. You can change everything afterwards.
        </DialogDescription>
      </DialogHeader>
      <form class="flex min-w-0 flex-col gap-4" novalidate @submit.prevent="submit">
        <div class="flex flex-col gap-1.5">
          <Label for="profile-name">Name</Label>
          <Input
            id="profile-name"
            v-model="name"
            :maxlength="CAPS.maxNameLength"
            :aria-invalid="nameError ? true : undefined"
            :aria-describedby="nameError ? 'profile-name-error' : undefined"
            autocomplete="off"
          />
          <p v-if="nameError" id="profile-name-error" role="alert" class="text-destructive text-sm">
            {{ nameError }}
          </p>
        </div>

        <div class="flex min-w-0 flex-col gap-1.5">
          <Label for="profile-template">Template</Label>
          <Select v-model="choice">
            <SelectTrigger id="profile-template" class="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="t in store.templates" :key="t.id" :value="t.id">
                {{ t.name }}{{ t.locked ? ', locked' : '' }}
              </SelectItem>
              <SelectItem :value="EMPTY">Start empty</SelectItem>
            </SelectContent>
          </Select>
          <p class="text-muted-foreground text-sm">
            {{ template ? template.description : 'No words, packs or schedule.' }}
          </p>
          <p v-if="loadError" role="alert" class="text-destructive text-sm">{{ loadError }}</p>
        </div>

        <div class="flex items-center gap-2">
          <Checkbox
            id="profile-locked"
            :model-value="locked"
            @update:model-value="(v) => (locked = v === true)"
          />
          <Label for="profile-locked">Locked (the Hush popup is read-only)</Label>
        </div>

        <p v-if="formError" role="alert" class="text-destructive text-sm">{{ formError }}</p>
        <DialogFooter>
          <Button type="button" variant="outline" @click="emit('update:open', false)">Cancel</Button>
          <Button type="submit" :disabled="saving">
            <LoaderCircle v-if="saving" class="animate-spin" aria-hidden="true" />
            Create profile
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
