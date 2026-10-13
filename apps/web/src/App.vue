<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'
import { Toaster } from '@/components/ui/sonner'
</script>

<template>
  <AppShell>
    <RouterView />
  </AppShell>
  <Toaster />
</template>
