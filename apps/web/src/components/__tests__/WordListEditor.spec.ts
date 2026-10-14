import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import WordListEditor from '../words/WordListEditor.vue'

const last = (w: ReturnType<typeof mount>) => {
  const all = w.emitted('update:modelValue') ?? []
  return all[all.length - 1]?.[0]
}

describe('WordListEditor', () => {
  it('adds a word on Enter and clears the field', async () => {
    const w = mount(WordListEditor, { props: { modelValue: ['cat'] } })
    const input = w.get('input')
    await input.setValue('  dog ')
    await input.trigger('keydown', { key: 'Enter' })
    expect(last(w)).toEqual(['cat', 'dog'])
    expect((input.element as HTMLInputElement).value).toBe('')
  })

  it('splits a pasted comma or newline list into many words', async () => {
    const w = mount(WordListEditor, { props: { modelValue: [] } })
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: () => 'one, two\nthree,,  =four ' },
    })
    w.get('input').element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(last(w)).toEqual(['one', 'two', 'three', '=four'])
  })

  it('refuses a case-insensitive duplicate with inline text', async () => {
    const w = mount(WordListEditor, { props: { modelValue: ['Cat'] } })
    await w.get('input').setValue('cat')
    await w.get('input').trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:modelValue')).toBeUndefined()
    expect(w.get('[role="alert"]').text()).toContain('Already in the list: cat')
  })

  it('refuses words past the cap and shows n / max', async () => {
    const w = mount(WordListEditor, { props: { modelValue: ['a', 'b'], max: 3 } })
    expect(w.text()).toContain('2 / 3')
    await w.get('input').setValue('c, d')
    await w.get('input').trigger('keydown', { key: 'Enter' })
    expect(last(w)).toEqual(['a', 'b', 'c'])
    expect(w.get('[role="alert"]').text()).toContain('full')
  })

  it('shows a = word as bare text with a pill, without rewriting it', () => {
    const w = mount(WordListEditor, { props: { modelValue: ['=nft', 'spoiler'] } })
    const items = w.findAll('li')
    expect(items[0]?.text()).toBe('=nft')
    expect(items[0]?.find('[title="Whole word"]').exists()).toBe(true)
    expect(items[1]?.find('[title="Whole word"]').exists()).toBe(false)
    expect(items[0]?.get('button').attributes('aria-label')).toBe('Remove =nft')
  })

  it('removes a word with its labelled button', async () => {
    const w = mount(WordListEditor, { props: { modelValue: ['a', 'b'] } })
    await w.get('button[aria-label="Remove a"]').trigger('click')
    expect(last(w)).toEqual(['b'])
  })

  it('is display-only when readonly', () => {
    const w = mount(WordListEditor, { props: { modelValue: ['a'], readonly: true } })
    expect(w.find('input').exists()).toBe(false)
    expect(w.find('button').exists()).toBe(false)
    expect(w.text()).toContain('a')
  })
})
