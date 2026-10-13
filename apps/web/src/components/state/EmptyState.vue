<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{ icon: Component; title: string; description: string }>()
</script>

<template>
  <div class="flex flex-col items-start gap-3 rounded-lg border border-dashed px-6 py-8">
    <component :is="icon" class="text-muted-foreground size-5" aria-hidden="true" />
    <div class="flex flex-col gap-1">
      <h2 class="text-base font-semibold">{{ title }}</h2>
      <p class="text-muted-foreground text-sm">{{ description }}</p>
    </div>
    <div v-if="$slots.action" class="pt-1">
      <slot name="action" />
    </div>
  </div>
</template>
