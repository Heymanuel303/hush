<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { LoaderCircle } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { CAPS } from 'contracts'
import type { Pack } from 'contracts'
import { ApiError } from '@/lib/api'
import { usePacksStore } from '@/stores/packs'
import WordListEditor from '@/components/words/WordListEditor.vue'
import { Button } from '@/components/ui/button'
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

const props = defineProps<{ open: boolean; pack: Pack | null }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()

const store = usePacksStore()
const name = ref('')
const words = ref<string[]>([])
const nameError = ref('')
const wordsError = ref('')
const saving = ref(false)

const editing = computed(() => props.pack !== null)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    name.value = props.pack?.name ?? ''
    words.value = props.pack ? [...props.pack.words] : []
    nameError.value = ''
    wordsError.value = ''
  },
  { immediate: true },
)

async function save() {
  nameError.value = ''
  wordsError.value = ''
  const trimmed = name.value.trim()
  if (!trimmed) nameError.value = 'Give the pack a name.'
  if (!words.value.length) wordsError.value = 'Add at least one word.'
  if (nameError.value || wordsError.value) return

  saving.value = true
  try {
    if (props.pack) await store.update(props.pack.id, { name: trimmed, words: words.value })
    else await store.create({ name: trimmed, words: words.value })
    toast.success(props.pack ? `Saved “${trimmed}”.` : `Created “${trimmed}”.`)
    emit('update:open', false)
  } catch (e) {
    if (!(e instanceof ApiError)) throw e
    if (e.error === 'name_taken') nameError.value = e.message
    else if (e.error === 'duplicate_word') wordsError.value = e.message
    else if (e.status === 400) wordsError.value = e.message
    else toast.error(e.message)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="grid-cols-1 sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ editing ? 'Edit pack' : 'New pack' }}</DialogTitle>
        <DialogDescription>
          A pack is a named set of words that profiles can switch on together.
        </DialogDescription>
      </DialogHeader>
      <form class="flex min-w-0 flex-col gap-4" novalidate @submit.prevent="save">
        <div class="flex flex-col gap-1.5">
          <Label for="pack-name">Name</Label>
          <Input
            id="pack-name"
            v-model="name"
            :maxlength="CAPS.maxNameLength"
            :aria-invalid="nameError ? true : undefined"
            :aria-describedby="nameError ? 'pack-name-error' : undefined"
            autocomplete="off"
          />
          <p v-if="nameError" id="pack-name-error" role="alert" class="text-destructive text-sm">
            {{ nameError }}
          </p>
        </div>
        <div class="flex flex-col gap-1.5">
          <span class="text-sm leading-none font-medium">Words</span>
          <WordListEditor v-model="words" :max="CAPS.maxPackWords" label="Add a word to the pack" />
          <p v-if="wordsError" role="alert" class="text-destructive text-sm">{{ wordsError }}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" @click="emit('update:open', false)">Cancel</Button>
          <Button type="submit" :disabled="saving">
            <LoaderCircle v-if="saving" class="animate-spin" aria-hidden="true" />
            Save
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
