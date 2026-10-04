import { describe, expect, it } from 'vitest'
import {
  appendMissingChipTokens,
  chipToken,
  chipsIn,
  composerDisplayText,
  composerLinkLabel,
  composerPlainText,
  expandComposerMessage,
  insertChipToken,
  linksFromDrop,
  removeChipToken,
  stripChipKind,
  stripPlanPrefix,
} from '@/lib/ai/admin-ai-composer-chips'

const elementId = '11111111-1111-1111-1111-111111111111'
const fileId = '22222222-2222-2222-2222-222222222222'
const linkId = '33333333-3333-3333-3333-333333333333'

describe('admin-ai-composer-chips', () => {
  it('inserts a chip between the words around the caret', () => {
    const placed = insertChipToken('make  blue', 5, 'element', elementId)
    expect(placed.value).toBe(`make ${chipToken('element', elementId)} blue`)
    expect(chipsIn(placed.value)).toEqual([{ kind: 'element', id: elementId }])
    expect(composerPlainText(placed.value)).toBe('make blue')
    expect(
      composerDisplayText(placed.value, [{ kind: 'element', id: elementId, label: 'button "Save"' }]),
    ).toBe('make [button "Save"] blue')
  })

  it('expands files, links, and elements where they sit in the sentence', () => {
    let value = 'review '
    let cursor = value.length
    const file = insertChipToken(value, cursor, 'file', fileId)
    value = file.value
    cursor = file.caret
    value = `${value}then `
    cursor = value.length
    const link = insertChipToken(value, cursor, 'link', linkId)
    value = `${link.value}on `
    const element = insertChipToken(value, value.length, 'element', elementId)
    const expanded = expandComposerMessage(element.value, {
      elements: [{ id: elementId, text: 'DOM Path: button.save' }],
      attachments: [{ id: fileId, label: 'notes.md', status: 'ready', excerpt: 'hello notes' }],
      links: [{ id: linkId, url: 'https://example.com/catalog' }],
    })
    const fileAt = expanded.indexOf('--- Attached: notes.md ---')
    const linkAt = expanded.indexOf('https://example.com/catalog')
    const elementAt = expanded.indexOf('DOM Path: button.save')
    expect(expanded.startsWith('review')).toBe(true)
    expect(fileAt).toBeGreaterThan(0)
    expect(linkAt).toBeGreaterThan(fileAt)
    expect(elementAt).toBeGreaterThan(linkAt)
    expect(expanded.indexOf('then')).toBeGreaterThan(fileAt)
    expect(expanded.indexOf('on')).toBeGreaterThan(linkAt)
  })

  it('drops file chips on reload and keeps element chips that were stored beside the text', () => {
    const raw = `look ${chipToken('file', fileId)} ${chipToken('element', elementId)}`
    const stripped = stripChipKind(raw, 'file')
    expect(chipsIn(stripped).some((chip) => chip.kind === 'file')).toBe(false)
    const restored = appendMissingChipTokens(stripped, 'element', [elementId])
    expect(chipsIn(restored)).toEqual([{ kind: 'element', id: elementId }])
    expect(removeChipToken(restored, 'element', elementId).trim()).toBe('look')
  })

  it('reads dropped links and ignores a paragraph that merely mentions a url', () => {
    expect(
      linksFromDrop({
        uriList: '# comment\nhttps://sxdirect.soundexchange.com/catalog\n',
        plain: 'https://sxdirect.soundexchange.com/catalog',
      }),
    ).toEqual(['https://sxdirect.soundexchange.com/catalog'])
    expect(linksFromDrop({ plain: 'see https://example.com later' })).toEqual([])
    expect(composerLinkLabel('https://example.com/catalog/claim')).toBe('example.com/catalog/claim')
    expect(stripPlanPrefix(`/plan recolor ${chipToken('element', elementId)}`)).toBe(
      `recolor ${chipToken('element', elementId)}`,
    )
  })
})
