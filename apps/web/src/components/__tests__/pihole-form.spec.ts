import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PiholeConnectionForm from '../pihole/PiholeConnectionForm.vue'
import { usePiholeStore } from '@/stores/pihole'

const fetchMock = vi.fn<typeof fetch>()
vi.stubGlobal('fetch', fetchMock)
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

beforeEach(() => {
  fetchMock.mockReset()
  setActivePinia(createPinia())
})

function sentBody(): Record<string, unknown> {
  const init = fetchMock.mock.calls[0]?.[1]
  return JSON.parse(String(init?.body)) as Record<string, unknown>
}

describe('PiholeConnectionForm', () => {
  it('sends appPassword only when it is filled', async () => {
    const store = usePiholeStore()
    store.connection = { url: 'http://pi.local', kidGroupName: 'Kid', hasSecret: true }
    fetchMock.mockResolvedValue(json(200, { ok: true, version: 'v6', groups: [] }))
    const wrapper = mount(PiholeConnectionForm)
    const password = wrapper.get('#pihole-password')
    expect(password.attributes('placeholder')).toBe('Leave empty to keep the stored password')

    await wrapper.findAll('button').find((b) => b.text() === 'Test connection')!.trigger('click')
    await flushPromises()
    expect(sentBody()).toEqual({ url: 'http://pi.local', kidGroupName: 'Kid' })

    fetchMock.mockClear()
    await password.setValue('secret')
    await wrapper.findAll('button').find((b) => b.text() === 'Test connection')!.trigger('click')
    await flushPromises()
    expect(sentBody()).toMatchObject({ appPassword: 'secret' })
  })

  it('keeps what the user typed after a test re-reads the connection', async () => {
    const store = usePiholeStore()
    store.connection = { url: 'http://pi.local', kidGroupName: 'Kid', hasSecret: true }
    fetchMock
      .mockResolvedValueOnce(json(200, { ok: false, error: 'pihole_unreachable' }))
      .mockResolvedValueOnce(json(200, { url: 'http://pi.local', kidGroupName: 'Kid', hasSecret: true }))
    const wrapper = mount(PiholeConnectionForm)
    await wrapper.get('#pihole-url').setValue('http://other.local')
    await wrapper.findAll('button').find((b) => b.text() === 'Test connection')!.trigger('click')
    await flushPromises()
    expect(sentBody()).toMatchObject({ url: 'http://other.local' })
    expect((wrapper.get('#pihole-url').element as HTMLInputElement).value).toBe('http://other.local')
  })

  it('requires a password while nothing is stored', async () => {
    const wrapper = mount(PiholeConnectionForm)
    await wrapper.get('#pihole-url').setValue('http://pi.local')
    const test = wrapper.findAll('button').find((b) => b.text() === 'Test connection')!
    expect(test.attributes('disabled')).toBeDefined()
    await wrapper.get('#pihole-password').setValue('x')
    expect(test.attributes('disabled')).toBeUndefined()
  })

  it('highlights the kid group and shows the no-sessions message from the api', async () => {
    const wrapper = mount(PiholeConnectionForm)
    await wrapper.get('#pihole-url').setValue('http://pi.local')
    await wrapper.get('#pihole-password').setValue('x')
    fetchMock.mockResolvedValueOnce(
      json(200, { ok: true, version: 'v6.0.4', groups: [{ id: 0, name: 'Default' }, { id: 1, name: 'Kid' }] }),
    )
    await wrapper.findAll('button').find((b) => b.text() === 'Test connection')!.trigger('click')
    await flushPromises()
    const badges = wrapper.findAll('[aria-label="Groups"] li')
    expect(badges.map((b) => b.text())).toEqual(['Default', 'Kid'])

    fetchMock.mockResolvedValueOnce(json(200, { ok: false, error: 'Pi-hole has no free API sessions. Raise webserver.api.max_sessions or free sessions.' }))
    await wrapper.findAll('button').find((b) => b.text() === 'Test connection')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('webserver.api.max_sessions')
  })
})
