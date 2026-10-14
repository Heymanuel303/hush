<script setup lang="ts">
import { RouterView, useRoute, useRouter } from 'vue-router'
import { LogOut } from '@lucide/vue'
import AppShell from '@/components/layout/AppShell.vue'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

async function signOut() {
  try {
    await auth.logout()
  } finally {
    await router.push('/signin')
  }
}
</script>

<template>
  <RouterView v-if="route.meta.public" />
  <AppShell v-else>
    <template #account>
      <span class="text-muted-foreground hidden max-w-48 truncate text-sm md:inline">
        {{ auth.admin?.email }}
      </span>
      <Button variant="ghost" size="sm" @click="signOut"><LogOut />Sign out</Button>
    </template>
    <RouterView />
  </AppShell>
  <Toaster />
</template>
