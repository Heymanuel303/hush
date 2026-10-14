<script setup lang="ts">
import { computed, useId } from 'vue'
import { Plus, Trash2 } from '@lucide/vue'
import { CAPS } from 'contracts'
import type { QuietHours, QuietWindow } from 'contracts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

// Shared by the profile editor and the Devices screen. `null` means "always"; the model is a
// contract `QuietHours`, so a parent can hand it straight to the API.
const props = withDefaults(
  defineProps<{ modelValue: QuietHours | null; readonly?: boolean; subject?: string }>(),
  { readonly: false, subject: 'these rules' },
)
const emit = defineEmits<{ 'update:modelValue': [value: QuietHours | null] }>()

const uid = useId()
// Monday first for display; the contract's days are 0..6 with 0 = Sunday.
const DAYS = [
  { value: 1, short: 'Mon', long: 'Monday' },
  { value: 2, short: 'Tue', long: 'Tuesday' },
  { value: 3, short: 'Wed', long: 'Wednesday' },
  { value: 4, short: 'Thu', long: 'Thursday' },
  { value: 5, short: 'Fri', long: 'Friday' },
  { value: 6, short: 'Sat', long: 'Saturday' },
  { value: 0, short: 'Sun', long: 'Sunday' },
] as const

const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

const zones = computed(() => {
  const all = Intl.supportedValuesOf('timeZone')
  const current = props.modelValue?.timezone
  const extra = [browserZone, current].filter((z): z is string => !!z && !all.includes(z))
  return [...new Set(extra), ...all]
})

const atCap = computed(() => (props.modelValue?.windows.length ?? 0) >= CAPS.maxWindows)

function toggleAll(on: boolean) {
  emit(
    'update:modelValue',
    on
      ? {
          timezone: browserZone,
          windows: [{ days: [1, 2, 3, 4, 5], start: '15:00', end: '19:00' }],
        }
      : null,
  )
}

function setWindows(windows: QuietWindow[]) {
  if (props.modelValue) emit('update:modelValue', { ...props.modelValue, windows })
}

function patchWindow(index: number, patch: Partial<QuietWindow>) {
  if (!props.modelValue) return
  setWindows(props.modelValue.windows.map((w, i) => (i === index ? { ...w, ...patch } : w)))
}

function toggleDay(index: number, day: number) {
  const w = props.modelValue?.windows[index]
  if (!w) return
  const days = w.days.includes(day) ? w.days.filter((d) => d !== day) : [...w.days, day]
  patchWindow(index, { days: days.sort((a, b) => a - b) })
}

function addWindow() {
  if (!props.modelValue || atCap.value) return
  setWindows([...props.modelValue.windows, { days: [1, 2, 3, 4, 5], start: '15:00', end: '19:00' }])
}

function removeWindow(index: number) {
  if (!props.modelValue) return
  const windows = props.modelValue.windows.filter((_, i) => i !== index)
  // The last window going away is the same as turning the schedule off.
  emit('update:modelValue', windows.length ? { ...props.modelValue, windows } : null)
}

function problem(w: QuietWindow): string {
  if (!w.days.length) return 'Pick at least one day.'
  if (w.start === w.end) return 'Start and end must differ.'
  return ''
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center gap-3">
      <Switch
        :id="`${uid}-on`"
        :model-value="modelValue !== null"
        :disabled="readonly"
        @update:model-value="toggleAll"
      />
      <Label :for="`${uid}-on`">Only apply {{ subject }} during set hours</Label>
    </div>
    <p class="text-muted-foreground max-w-prose text-sm">
      A window that ends before it starts runs past midnight. Outside the windows only the
      device’s own local words apply.
    </p>

    <template v-if="modelValue">
      <div class="flex flex-col gap-1.5">
        <Label :for="`${uid}-tz`">Timezone</Label>
        <Select
          :model-value="modelValue.timezone"
          :disabled="readonly"
          @update:model-value="(v) => emit('update:modelValue', { ...modelValue!, timezone: String(v) })"
        >
          <SelectTrigger :id="`${uid}-tz`" class="w-full max-w-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent class="max-h-72">
            <SelectItem v-for="zone in zones" :key="zone" :value="zone">{{ zone }}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ul class="flex flex-col gap-3" aria-label="Time windows">
        <li
          v-for="(w, index) in modelValue.windows"
          :key="index"
          class="bg-card flex flex-col gap-3 rounded-md border p-3"
        >
          <div
            role="group"
            :aria-label="`Days for window ${index + 1}`"
            class="flex flex-wrap gap-1"
          >
            <Button
              v-for="day in DAYS"
              :key="day.value"
              type="button"
              size="sm"
              :variant="w.days.includes(day.value) ? 'default' : 'outline'"
              :aria-pressed="w.days.includes(day.value)"
              :aria-label="day.long"
              :disabled="readonly"
              @click="toggleDay(index, day.value)"
            >
              {{ day.short }}
            </Button>
          </div>
          <div class="flex flex-wrap items-end gap-3">
            <div class="flex flex-col gap-1.5">
              <Label :for="`${uid}-s${index}`">Start (window {{ index + 1 }})</Label>
              <Input
                :id="`${uid}-s${index}`"
                type="time"
                class="w-32"
                :model-value="w.start"
                :disabled="readonly"
                @update:model-value="(v) => patchWindow(index, { start: String(v) })"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <Label :for="`${uid}-e${index}`">End (window {{ index + 1 }})</Label>
              <Input
                :id="`${uid}-e${index}`"
                type="time"
                class="w-32"
                :model-value="w.end"
                :disabled="readonly"
                @update:model-value="(v) => patchWindow(index, { end: String(v) })"
              />
            </div>
            <Button
              v-if="!readonly"
              type="button"
              variant="ghost"
              size="icon"
              class="ml-auto"
              :aria-label="`Remove window ${index + 1}`"
              @click="removeWindow(index)"
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
          <p v-if="problem(w)" role="alert" class="text-destructive text-sm">{{ problem(w) }}</p>
        </li>
      </ul>

      <div v-if="!readonly" class="flex items-center gap-3">
        <Button type="button" variant="outline" :disabled="atCap" @click="addWindow">
          <Plus aria-hidden="true" />Add window
        </Button>
        <p v-if="atCap" class="text-muted-foreground text-sm">
          At most {{ CAPS.maxWindows }} windows.
        </p>
      </div>
    </template>
  </div>
</template>
