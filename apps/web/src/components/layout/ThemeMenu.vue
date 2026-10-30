<script setup lang="ts">
import { Monitor, Moon, Sun } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { AcceptableValue } from 'reka-ui'
import { useTheme, type ThemePreference } from '@/composables/useTheme'

const { preference, resolved, setPreference } = useTheme()

const options: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'auto', label: 'System', icon: Monitor },
]

// The radio group emits any AcceptableValue; only the three preferences reach the store.
function onSelect(value: AcceptableValue) {
  const option = options.find((o) => o.value === value)
  if (option) setPreference(option.value)
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon" aria-label="Theme">
        <Sun v-if="resolved === 'light'" aria-hidden="true" />
        <Moon v-else aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuRadioGroup :model-value="preference" @update:model-value="onSelect">
        <DropdownMenuRadioItem v-for="o in options" :key="o.value" :value="o.value">
          <component :is="o.icon" aria-hidden="true" />
          {{ o.label }}
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
