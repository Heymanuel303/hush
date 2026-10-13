<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'

withDefaults(defineProps<{ rows?: number; label?: string }>(), { rows: 4, label: 'Loading' })
</script>

<template>
  <div role="status" :aria-label="label" class="flex flex-col divide-y rounded-lg border">
    <div v-for="n in rows" :key="n" class="flex h-10 items-center gap-3 px-3">
      <Skeleton class="h-3 w-1/4" />
      <Skeleton class="h-3 w-1/3" />
      <Skeleton class="ml-auto h-3 w-12" />
    </div>
  </div>
</template>
