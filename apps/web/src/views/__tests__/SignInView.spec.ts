import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import SignInView from '../SignInView.vue'

const fetchMock = vi.fn<typeof fetch>()
vi.stubGlobal('fetch', fetchMock)
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

async function open(query: Record<string, string> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/signin', component: SignInView }],
  })
  await router.push({ path: '/signin', query })
  const wrapper = mount(SignInView, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(json(200, { adminConfigured: true }))
  setActivePinia(createPinia())
})

describe('SignInView', () => {
  it('renders the Hey Id link with the safe return path', async () => {
    const link = (await open({ next: '/devices?x=1' })).get('a')
    expect(link.text()).toBe('Sign in with Hey Id')
    expect(link.attributes('href')).toBe(
      `/api/auth/sso/login?return=${encodeURIComponent('/devices?x=1')}`,
    )
  })

  it('replaces an unsafe next with the default landing page', async () => {
    const link = (await open({ next: '//evil.example' })).get('a')
    expect(link.attributes('href')).toBe(
      `/api/auth/sso/login?return=${encodeURIComponent('/profiles')}`,
    )
  })

  it('shows the not_an_admin message', async () => {
    const wrapper = await open({ error: 'not_an_admin' })
    expect(wrapper.get('[role="alert"]').text()).toBe("This account is not the hub's admin")
  })

  it('shows a generic message for an unknown error code', async () => {
    expect((await open({ error: 'weird' })).text()).toContain('Sign-in failed. Try again.')
  })

  it('shows no error alert without ?error=', async () => {
    expect((await open()).find('[role="alert"]').exists()).toBe(false)
  })

  it('names ADMIN_EMAIL and ISSUER_URL when no admin is configured', async () => {
    fetchMock.mockResolvedValue(json(200, { adminConfigured: false }))
    const text = (await open()).text()
    expect(text).toContain('ADMIN_EMAIL')
    expect(text).toContain('ISSUER_URL')
  })
})
