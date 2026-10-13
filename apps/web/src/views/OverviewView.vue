<script setup lang="ts">
import { Users } from '@lucide/vue'
import EmptyState from '@/components/state/EmptyState.vue'
</script>

<template>
  <section class="flex flex-col gap-6">
    <div class="flex flex-col gap-1">
      <h1 class="text-xl font-semibold">Household</h1>
      <p class="text-muted-foreground text-sm">
        Profiles set the words each browser hides. Config flows down to paired browsers; nothing
        flows back.
      </p>
    </div>
    <EmptyState
      :icon="Users"
      title="No profiles yet"
      description="Create a profile, then pair a browser to it with a six-letter code."
    />
  </section>
</template>
