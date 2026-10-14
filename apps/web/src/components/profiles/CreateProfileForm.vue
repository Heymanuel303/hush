<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { LoaderCircle } from '@lucide/vue'
import { CAPS, TemplateId } from 'contracts'
import type { ProfileWithRules } from 'contracts'
import { ApiError } from '@/lib/api'
import { useProfilesStore } from '@/stores/profiles'
import ErrorState from '@/components/state/ErrorState.vue'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// The form body of "New profile": shared by CreateProfileDialog and the setup wizard. It creates
// the profile through the store and reports it; where to go next is the parent's decision.
withDefaults(defineProps<{ cancelable?: boolean }>(), { cancelable: true })
const emit = defineEmits<{ created: [profile: ProfileWithRules]; cancel: [] }>()

const EMPTY = 'empty'
const store = useProfilesStore()

const name = ref('')
const choice = ref<string>(EMPTY)
const locked = ref(false)
const nameError = ref('')
const formError = ref('')
const loadError = ref('')
const saving = ref(false)

const template = computed(() => store.templates.find((t) => t.id === choice.value))

const loadingTemplates = ref(true)

async function loadTemplates() {
  loadError.value = ''
  loadingTemplates.value = true
  try {
    await store.loadTemplates()
  } catch (e) {
    loadError.value = e instanceof ApiError ? e.message : 'Templates could not be loaded.'
  } finally {
    loadingTemplates.value = false
  }
}

onMounted(loadTemplates)

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
    emit('created', profile)
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
      <Select v-model="choice" :disabled="loadingTemplates">
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
      <p v-if="loadingTemplates" role="status" class="text-muted-foreground text-sm">Loading templates…</p>
      <ErrorState v-if="loadError" title="Templates did not load" :message="loadError">
        <template #retry>
          <Button type="button" variant="outline" size="sm" @click="loadTemplates">Try again</Button>
        </template>
      </ErrorState>
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
    <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button v-if="cancelable" type="button" variant="outline" @click="emit('cancel')">Cancel</Button>
      <Button type="submit" :disabled="saving">
        <LoaderCircle v-if="saving" class="animate-spin" aria-hidden="true" />
        Create profile
      </Button>
    </div>
  </form>
</template>
