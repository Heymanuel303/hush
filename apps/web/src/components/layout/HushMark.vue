<script setup lang="ts">
// The Hush mark: the slashed circle from the extension popup (src/popup/panel.html), on the
// accent tile, so the console and the popup read as one product.
withDefaults(defineProps<{ size?: number }>(), { size: 24 })
</script>

<template>
  <span
    class="bg-primary text-primary-foreground inline-flex shrink-0 items-center justify-center rounded-md"
    :style="{ width: `${size}px`, height: `${size}px` }"
    aria-hidden="true"
  >
    <svg
      :width="Math.round(size * 0.6)"
      :height="Math.round(size * 0.6)"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="5" y1="5" x2="17" y2="17" />
    </svg>
  </span>
</template>
