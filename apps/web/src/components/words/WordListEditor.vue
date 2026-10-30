<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { X } from '@lucide/vue'
import { CAPS } from 'contracts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

// The only word editor in the web app. Words are opaque strings: the leading `=`
// (whole-word) is displayed as a pill but never parsed, stripped or rewritten.
const props = withDefaults(
  defineProps<{ modelValue: string[]; max?: number; readonly?: boolean; label?: string }>(),
  { max: CAPS.maxWords, readonly: false, label: 'Add a word' },
)
const emit = defineEmits<{ 'update:modelValue': [words: string[]] }>()

const draft = ref('')
const notice = ref('')
const inputId = useId()
const noticeId = useId()

const atCap = computed(() => props.modelValue.length >= props.max)

function split(text: string): string[] {
  return text.split(/[\n,]+/)
}

function addMany(raw: string[]) {
  const next = [...props.modelValue]
  const seen = new Set(next.map((w) => w.toLowerCase()))
  const duplicates: string[] = []
  let overCap = false
  let tooLong = false
  for (const item of raw) {
    const word = item.trim()
    if (!word) continue
    if (word.length > CAPS.maxWordLength) {
      tooLong = true
      continue
    }
    if (word.slice(word.startsWith('=') ? 1 : 0).trim() === '') continue
    if (seen.has(word.toLowerCase())) {
      duplicates.push(word)
      continue
    }
    if (next.length >= props.max) {
      overCap = true
      break
    }
    seen.add(word.toLowerCase())
    next.push(word)
  }
  if (next.length !== props.modelValue.length) emit('update:modelValue', next)
  const messages: string[] = []
  if (duplicates.length) messages.push(`Already in the list: ${duplicates.join(', ')}.`)
  if (overCap) messages.push(`The list is full (${props.max} words).`)
  if (tooLong) messages.push(`Words can be at most ${CAPS.maxWordLength} characters.`)
  notice.value = messages.join(' ')
  // A single refused word stays in the field so it can be corrected.
  draft.value = messages.length && raw.length === 1 ? (raw[0] ?? '') : ''
}

function onEnter() {
  addMany(split(draft.value))
}

function onPaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData('text') ?? ''
  if (!/[\n,]/.test(text)) return
  event.preventDefault()
  addMany(split(text))
}

function remove(index: number) {
  notice.value = ''
  emit(
    'update:modelValue',
    props.modelValue.filter((_, i) => i !== index),
  )
}

const bare = (word: string) => (word.startsWith('=') ? word.slice(1) : word)
</script>

<template>
  <div class="flex min-w-0 flex-col gap-2">
    <div v-if="!readonly" class="flex flex-col gap-1">
      <label :for="inputId" class="sr-only">{{ label }}</label>
      <Input
        :id="inputId"
        v-model="draft"
        :disabled="atCap"
        :aria-invalid="notice ? true : undefined"
        :aria-describedby="notice ? noticeId : undefined"
        placeholder="Type a word, press Enter. Paste a list to add many."
        autocomplete="off"
        @keydown.enter.prevent="onEnter"
        @paste="onPaste"
      />
      <p v-if="notice" :id="noticeId" role="alert" class="text-destructive text-sm">
        {{ notice }}
      </p>
    </div>

    <ul
      v-if="modelValue.length"
      class="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto"
      aria-label="Words"
    >
      <li v-for="(word, index) in modelValue" :key="word.toLowerCase()" class="max-w-full">
        <Badge
          variant="secondary"
          class="dark:border-input dark:bg-input/30 h-6 max-w-full gap-1 pr-1 font-normal"
        >
          <span
            v-if="word.startsWith('=')"
            class="bg-primary text-primary-foreground rounded-sm px-1 font-mono text-[11px] leading-4"
            title="Whole word"
            >=</span
          >
          <span class="truncate">{{ bare(word) }}</span>
          <Button
            v-if="!readonly"
            type="button"
            variant="ghost"
            size="icon-xs"
            class="size-4"
            :aria-label="`Remove ${word}`"
            @click="remove(index)"
          >
            <X aria-hidden="true" />
          </Button>
        </Badge>
      </li>
    </ul>
    <p v-else class="text-muted-foreground text-sm">No words yet.</p>

    <p class="text-muted-foreground font-mono text-xs" aria-live="polite">
      {{ modelValue.length }} / {{ max }}
    </p>
  </div>
</template>
