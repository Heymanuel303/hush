import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import CreateProfileForm from '../profiles/CreateProfileForm.vue'

const fetchMock = vi.fn<typeof fetch>()
vi.stubGlobal('fetch', fetchMock)
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

beforeEach(() => {
  fetchMock.mockReset()
  setActivePinia(createPinia())
})

describe('CreateProfileForm templates', () => {
  it('shows a loading note, then an error with a retry that reloads the templates', async () => {
    fetchMock.mockResolvedValueOnce(json(500, { error: 'server_error', message: 'Templates are down.' }))
    const wrapper = mount(CreateProfileForm)
    expect(wrapper.text()).toContain('Loading templates')
    await flushPromises()
    expect(wrapper.text()).toContain('Templates are down.')
    expect(wrapper.text()).not.toContain('Loading templates')

    fetchMock.mockResolvedValueOnce(json(200, []))
    await wrapper.findAll('button').find((b) => b.text() === 'Try again')!.trigger('click')
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).not.toContain('Templates are down.')
  })
})
