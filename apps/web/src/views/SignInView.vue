<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { CircleAlert, TriangleAlert } from '@lucide/vue'
import HushMark from '@/components/layout/HushMark.vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { safeNext } from '@/router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()

const notConfigured = computed(() => auth.setupStatus?.adminConfigured === false)

const loginHref = computed(
  () => `/api/auth/sso/login?return=${encodeURIComponent(safeNext(route.query.next))}`,
)

const ERROR_MESSAGES: Record<string, string> = {
  not_an_admin: "This account is not the hub's admin",
  access_denied: 'Hey Id did not grant access. Try again.',
  login_expired: 'The sign-in took too long. Try again.',
  login_failed: 'Sign-in failed. Try again.',
}

const errorMessage = computed(() => {
  const code = route.query.error
  if (typeof code !== 'string' || code === '') return null
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.login_failed
})

onMounted(() => {
  // A failed status read only hides the operator hint; the link still works.
  auth.loadSetupStatus().catch(() => undefined)
})
</script>

<template>
  <div class="bg-background flex min-h-dvh flex-col items-center justify-center gap-6 px-(--gutter) py-8">
    <header class="flex items-center gap-2 font-semibold">
      <HushMark :size="32" />
      <span class="text-lg">Hush</span>
    </header>
    <main class="w-full max-w-sm">
    <Card>
      <CardHeader>
        <CardTitle as="h1" class="text-lg">Sign in to Hush</CardTitle>
        <CardDescription>
          Manage the words each browser in your household hides. Config flows down; nothing flows
          back.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div class="flex flex-col gap-4">
          <Alert v-if="notConfigured">
            <TriangleAlert />
            <AlertTitle>No admin account yet</AlertTitle>
            <AlertDescription>
              Set <code class="font-mono">ADMIN_EMAIL</code> and
              <code class="font-mono">ISSUER_URL</code> in <code class="font-mono">.env</code>
              and restart the hub.
            </AlertDescription>
          </Alert>

          <Alert v-if="errorMessage" variant="destructive">
            <CircleAlert />
            <AlertDescription>{{ errorMessage }}</AlertDescription>
          </Alert>

          <Button as="a" :href="loginHref">Sign in with Hey Id</Button>
        </div>
      </CardContent>
    </Card>
    </main>
  </div>
</template>
