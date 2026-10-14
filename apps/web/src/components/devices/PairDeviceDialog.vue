<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import PairDevicePanel from './PairDevicePanel.vue'

// Shared by the Devices screen and (as PairDevicePanel) the setup wizard.
defineProps<{ open: boolean; profileId?: string }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="grid-cols-1 sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Pair a device</DialogTitle>
        <DialogDescription class="sr-only">Show a pairing code for a browser running Hush.</DialogDescription>
      </DialogHeader>
      <PairDevicePanel
        v-if="open"
        :profile-id="profileId"
        @done="emit('update:open', false)"
        @cancel="emit('update:open', false)"
      />
    </DialogContent>
  </Dialog>
</template>
