<script setup lang="ts">
import { CircleAlert } from '@lucide/vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

withDefaults(defineProps<{ title?: string; message: string }>(), {
  title: 'Something went wrong',
})
</script>

<template>
  <Alert variant="destructive">
    <CircleAlert />
    <AlertTitle>{{ title }}</AlertTitle>
    <AlertDescription>
      <p>{{ message }}</p>
      <div v-if="$slots.retry" class="pt-2">
        <slot name="retry" />
      </div>
    </AlertDescription>
  </Alert>
</template>
