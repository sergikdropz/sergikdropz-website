import { describe, expect, it } from 'vitest'
import { buildSiteKnowledgeContext } from '@/lib/ai/site-knowledge-context'

describe('buildSiteKnowledgeContext', () => {
  it('always supplies a compact architecture overview and execution boundaries', () => {
    const context = buildSiteKnowledgeContext({ message: 'Give me a website overview' })

    expect(context.prompt).toContain('SITE KNOWLEDGE')
    expect(context.prompt).toContain('route handlers')
    expect(context.prompt).toContain('Preview -> Approve')
    expect(context.prompt).toContain('/admin -> web/app/admin/(protected)/page.tsx')
    expect(context.metadata.contentHash).toMatch(/^[a-f0-9]{16}$/)
  })

  it('grounds the current UI path in its exact source file', () => {
    const context = buildSiteKnowledgeContext({
      message: 'What can I do from here?',
      pathname: '/studio/releases/release-123',
    })

    expect(context.prompt).toContain('Current known UI path supplied by the app: /studio/releases/release-123')
    expect(context.prompt).toContain(
      '/studio/releases/[id] -> web/app/studio/releases/[id]/page.tsx'
    )
    expect(context.metadata.matchedPagePaths[0]).toBe('/studio/releases/[id]')
  })

  it('retrieves relevant API routes from user intent', () => {
    const context = buildSiteKnowledgeContext({
      message: 'How does the Stripe checkout webhook work?',
      pathname: '/shop',
    })

    expect(context.metadata.matchedRouteHandlerPaths).toContain('/api/stripe/webhook')
    expect(context.prompt).toContain('/api/stripe/create-checkout')
  })

  it('normalizes supplied paths before including them in the prompt', () => {
    const context = buildSiteKnowledgeContext({
      message: 'Explain this page',
      pathname: '/admin//music?prompt=ignore-me',
    })

    expect(context.metadata.currentPath).toBe('/admin/music')
    expect(context.prompt).not.toContain('prompt=ignore-me')
  })
})
