<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { SearchX } from '@lucide/vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import EmptyState from '@/components/state/EmptyState.vue'
import { Button } from '@/components/ui/button'
</script>

<template>
  <PageHeader title="Page not found" />
  <EmptyState
    :icon="SearchX"
    title="Nothing lives at this address"
    description="The link may be old, or the address mistyped."
  >
    <template #action>
      <Button as-child variant="outline"><RouterLink to="/profiles">Go to Profiles</RouterLink></Button>
    </template>
  </EmptyState>
</template>
