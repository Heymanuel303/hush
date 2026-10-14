<script setup lang="ts">
import { Shield } from '@lucide/vue'
import type { Device } from 'contracts'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { kidSwitchReason } from '@/lib/devices'

const props = defineProps<{ device: Device; piholeConnected: boolean; busy?: boolean }>()
const emit = defineEmits<{ toggle: [enabled: boolean] }>()

const reason = () => kidSwitchReason(props.device, props.piholeConnected)
const STATE_LABEL = { kid: 'kid', default: 'default', unknown: 'unknown', error: 'error' } as const
</script>

<template>
  <div class="flex items-center gap-3">
    <Tooltip v-if="reason()">
      <TooltipTrigger as-child>
        <!-- A disabled control takes no focus; the wrapper keeps the reason reachable by keyboard. -->
        <span tabindex="0" class="inline-flex rounded-md">
          <Switch
            :model-value="device.kidMode.enabled"
            disabled
            :aria-label="`Kid mode for ${device.label}`"
          />
        </span>
      </TooltipTrigger>
      <TooltipContent>{{ reason() }}</TooltipContent>
    </Tooltip>
    <Switch
      v-else
      :model-value="device.kidMode.enabled"
      :disabled="busy"
      :aria-label="`Kid mode for ${device.label}`"
      @update:model-value="emit('toggle', $event)"
    />
    <Tooltip v-if="device.kidMode.lastError">
      <TooltipTrigger as-child>
        <Badge variant="destructive" tabindex="0" data-testid="kid-state">{{ STATE_LABEL[device.kidMode.state] }}</Badge>
      </TooltipTrigger>
      <TooltipContent>{{ device.kidMode.lastError }}</TooltipContent>
    </Tooltip>
    <Badge v-else :variant="device.kidMode.state === 'kid' ? 'default' : 'secondary'" data-testid="kid-state">
      <Shield v-if="device.kidMode.state === 'kid'" aria-hidden="true" />
      {{ STATE_LABEL[device.kidMode.state] }}
    </Badge>
  </div>
</template>
