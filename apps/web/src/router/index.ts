import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useHubStore } from '@/stores/hub'

declare module 'vue-router' {
  interface RouteMeta {
    /** Renders without the AppShell and without a session. */
    public?: boolean
  }
}

// Stub views are overwritten by the later web tickets; the table stays as it is.
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // No component: the guard sends "/" to /setup (a hub with no profiles) or /profiles.
    { path: '/', name: 'home', component: () => import('@/views/NotFoundView.vue') },
    {
      path: '/signin',
      name: 'signin',
      component: () => import('@/views/SignInView.vue'),
      meta: { public: true },
    },
    { path: '/setup', name: 'setup', component: () => import('@/views/SetupView.vue') },
    { path: '/profiles', name: 'profiles', component: () => import('@/views/ProfilesView.vue') },
    {
      path: '/profiles/:id',
      name: 'profile',
      component: () => import('@/views/ProfileDetailView.vue'),
    },
    { path: '/devices', name: 'devices', component: () => import('@/views/DevicesView.vue') },
    { path: '/packs', name: 'packs', component: () => import('@/views/PacksView.vue') },
    { path: '/pihole', name: 'pihole', component: () => import('@/views/PiholeView.vue') },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue'),
    },
  ],
})

/** Only same-origin paths: "//host" and "/\\host" would leave the app. */
export function safeNext(next: unknown): string {
  return typeof next === 'string' &&
    next.startsWith('/') &&
    !next.startsWith('//') &&
    !next.startsWith('/\\')
    ? next
    : '/profiles'
}

/** Loads the session once, then keeps anonymous visitors on /signin and signed-in ones off it. */
export function installAuthGuard(r: typeof router): void {
  r.beforeEach(async (to) => {
    const auth = useAuthStore()
    if (auth.status === 'unknown') {
      try {
        await auth.load()
      } catch {
        // Hub unreachable: the sign-in screen is the one place that can say so.
        return to.name === 'signin' ? true : { name: 'signin', query: { next: to.fullPath } }
      }
    }
    if (to.name === 'signin') {
      if (auth.status !== 'authenticated') return true
      return to.query.next ? safeNext(to.query.next) : { name: 'home' }
    }
    if (!to.meta.public && auth.status !== 'authenticated') {
      return { name: 'signin', query: { next: to.fullPath } }
    }
    if (to.name === 'home') return (await needsSetup()) ? { name: 'setup' } : { name: 'profiles' }
    return true
  })
}

/** A hub with no profiles opens on /setup. If the status cannot be read, the normal landing page wins. */
async function needsSetup(): Promise<boolean> {
  try {
    return (await useHubStore().ensure()).profileCount === 0
  } catch {
    return false
  }
}

installAuthGuard(router)

export default router
