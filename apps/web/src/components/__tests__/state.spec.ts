import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { Users } from '@lucide/vue'
import EmptyState from '../state/EmptyState.vue'
import ErrorState from '../state/ErrorState.vue'
import LoadingState from '../state/LoadingState.vue'

describe('state components', () => {
  it('EmptyState renders title, line and action slot', () => {
    const wrapper = mount(EmptyState, {
      props: { icon: Users, title: 'No profiles yet', description: 'Create one.' },
      slots: { action: '<button>New profile</button>' },
    })
    expect(wrapper.get('h2').text()).toBe('No profiles yet')
    expect(wrapper.text()).toContain('Create one.')
    expect(wrapper.get('button').text()).toBe('New profile')
  })

  it('LoadingState renders the requested skeleton rows', () => {
    const wrapper = mount(LoadingState, { props: { rows: 3 } })
    expect(wrapper.get('[role="status"]').element.children).toHaveLength(3)
  })

  it('ErrorState renders the message and the retry slot', () => {
    const wrapper = mount(ErrorState, {
      props: { message: 'The hub did not answer.' },
      slots: { retry: '<button>Retry</button>' },
    })
    expect(wrapper.text()).toContain('The hub did not answer.')
    expect(wrapper.get('button').text()).toBe('Retry')
  })
})
