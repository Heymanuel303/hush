<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { CircleAlert, LoaderCircle, TriangleAlert } from '@lucide/vue'
import HushMark from '@/components/layout/HushMark.vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import { safeNext } from '@/router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')
const submitting = ref(false)
const error = ref<string | null>(null)

const notConfigured = computed(() => auth.setupStatus?.adminConfigured === false)

function messageFor(e: unknown): string {
  if (!(e instanceof ApiError)) return 'Something went wrong. Try again.'
  if (e.status === 401) return 'Email or password is wrong'
  if (e.status === 429) return 'Too many attempts, wait a minute'
  if (e.status === 0) return 'The hub did not answer. Check that it is running.'
  return `Sign-in failed (status ${e.status}). Try again.`
}

async function submit() {
  if (submitting.value) return
  submitting.value = true
  error.value = null
  try {
    await auth.login(email.value, password.value)
    await router.push(route.query.next ? safeNext(route.query.next) : '/')
  } catch (e) {
    error.value = messageFor(e)
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  // A failed status read only hides the operator hint; the form still works.
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
        <form class="flex flex-col gap-4" novalidate @submit.prevent="submit">
          <Alert v-if="notConfigured">
            <TriangleAlert />
            <AlertTitle>No admin account yet</AlertTitle>
            <AlertDescription>
              Set <code class="font-mono">ADMIN_EMAIL</code> and
              <code class="font-mono">ADMIN_PASSWORD</code> in <code class="font-mono">.env</code>
              and restart the hub.
            </AlertDescription>
          </Alert>

          <Alert v-if="error" variant="destructive">
            <CircleAlert />
            <AlertDescription>{{ error }}</AlertDescription>
          </Alert>

          <div class="flex flex-col gap-2">
            <Label for="email">Email</Label>
            <Input
              id="email"
              v-model="email"
              type="email"
              autocomplete="username"
              required
              :disabled="submitting"
            />
          </div>
          <div class="flex flex-col gap-2">
            <Label for="password">Password</Label>
            <Input
              id="password"
              v-model="password"
              type="password"
              autocomplete="current-password"
              required
              :disabled="submitting"
            />
          </div>
          <Button type="submit" :disabled="submitting">
            <LoaderCircle v-if="submitting" class="animate-spin" aria-hidden="true" />
            {{ submitting ? 'Signing in' : 'Sign in' }}
          </Button>
        </form>
      </CardContent>
    </Card>
    </main>
  </div>
</template>
