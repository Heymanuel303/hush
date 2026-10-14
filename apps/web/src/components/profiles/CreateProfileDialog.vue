<script setup lang="ts">
import { useRouter } from 'vue-router'
import type { ProfileWithRules } from 'contracts'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import CreateProfileForm from './CreateProfileForm.vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [open: boolean] }>()
const router = useRouter()

async function created(profile: ProfileWithRules) {
  emit('update:open', false)
  await router.push({ name: 'profile', params: { id: profile.id } })
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
      <CreateProfileForm @created="created" @cancel="emit('update:open', false)" />
    </DialogContent>
  </Dialog>
</template>
