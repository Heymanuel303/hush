import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { CAPS, QuietHours } from 'contracts'
import ScheduleEditor from '../schedule/ScheduleEditor.vue'

const window1 = { days: [1, 2], start: '15:00', end: '19:00' }
const last = (w: ReturnType<typeof mount>) => {
  const all = w.emitted('update:modelValue') ?? []
  return all[all.length - 1]?.[0]
}

describe('ScheduleEditor', () => {
  it('shows only the switch while the schedule is off', () => {
    const w = mount(ScheduleEditor, { props: { modelValue: null } })
    expect(w.text()).toContain('Only apply these rules during set hours')
    expect(w.text()).toContain('past midnight')
    expect(w.text()).not.toContain('Add window')
  })

  it('turning it on emits a valid QuietHours with one window', async () => {
    const w = mount(ScheduleEditor, { props: { modelValue: null } })
    await w.get('button[role="switch"]').trigger('click')
    expect(QuietHours.safeParse(last(w)).success).toBe(true)
  })

  it('turning it off emits null', async () => {
    const w = mount(ScheduleEditor, {
      props: { modelValue: { timezone: 'UTC', windows: [window1] } },
    })
    await w.get('button[role="switch"]').trigger('click')
    expect(last(w)).toBeNull()
  })

  it('toggling a day and Add window emit valid QuietHours', async () => {
    const w = mount(ScheduleEditor, {
      props: { modelValue: { timezone: 'UTC', windows: [window1] } },
    })
    await w.get('button[aria-label="Wednesday"]').trigger('click')
    expect(last(w)).toEqual({ timezone: 'UTC', windows: [{ ...window1, days: [1, 2, 3] }] })
    expect(w.get('button[aria-label="Monday"]').attributes('aria-pressed')).toBe('true')

    const add = w.findAll('button').find((b) => b.text().includes('Add window'))
    await add?.trigger('click')
    const out = QuietHours.safeParse(last(w))
    expect(out.success && out.data.windows).toHaveLength(2)
  })

  it('refuses a window beyond the cap', async () => {
    const windows = Array.from({ length: CAPS.maxWindows }, () => window1)
    const w = mount(ScheduleEditor, { props: { modelValue: { timezone: 'UTC', windows } } })
    const add = w.findAll('button').find((b) => b.text().includes('Add window'))
    expect(add?.attributes('disabled')).toBeDefined()
    await add?.trigger('click')
    expect(w.emitted('update:modelValue')).toBeUndefined()
    expect(w.text()).toContain(`At most ${CAPS.maxWindows} windows`)
  })

  it('removing the last window turns the schedule off', async () => {
    const w = mount(ScheduleEditor, {
      props: { modelValue: { timezone: 'UTC', windows: [window1] } },
    })
    await w.get('button[aria-label="Remove window 1"]').trigger('click')
    expect(last(w)).toBeNull()
  })

  it('flags a window whose start equals its end', () => {
    const w = mount(ScheduleEditor, {
      props: { modelValue: { timezone: 'UTC', windows: [{ ...window1, end: '15:00' }] } },
    })
    expect(w.get('[role="alert"]').text()).toBe('Start and end must differ.')
  })
})
