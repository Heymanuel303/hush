<script setup lang="ts">
import { Hourglass } from '@lucide/vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import EmptyState from '@/components/state/EmptyState.vue'
</script>

<template>
  <PageHeader title="Profiles" />
  <EmptyState
    :icon="Hourglass"
    title="Not built yet"
    description="This screen arrives with a later change."
  />
</template>
