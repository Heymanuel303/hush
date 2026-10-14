<script setup lang="ts">
import { Ellipsis } from '@lucide/vue'
import type { Device } from 'contracts'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type DeviceAction = 'rename' | 'profile' | 'ip' | 'schedule' | 'revoke'

defineProps<{ device: Device }>()
const emit = defineEmits<{ choose: [action: DeviceAction] }>()
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon" :aria-label="`Actions for ${device.label}`">
        <Ellipsis aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem @select="emit('choose', 'rename')">Rename</DropdownMenuItem>
      <DropdownMenuItem @select="emit('choose', 'profile')">Change profile</DropdownMenuItem>
      <DropdownMenuItem @select="emit('choose', 'ip')">Set Tailscale IP</DropdownMenuItem>
      <DropdownMenuItem @select="emit('choose', 'schedule')">Kid-mode schedule</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" @select="emit('choose', 'revoke')">Revoke</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
