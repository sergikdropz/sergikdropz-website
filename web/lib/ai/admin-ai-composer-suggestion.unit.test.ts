import { describe, expect, it } from 'vitest'
import { composerGhostSuggestion, planArmedPrompt, recommendReplyFollowUps } from '@/lib/ai/admin-ai-composer-suggestion'

function expectNextStepOnly(suggestion: string) {
  expect(suggestion).not.toMatch(/^(Goal|Thread|I asked|Priority):/)
  expect(suggestion).not.toMatch(/Do that next in this chat/)
}

describe('composer ghost suggestion', () => {
  it('turns an Unauthorized reply into the resume step', () => {
    const suggestion = composerGhostSuggestion({
      messages: [
        { role: 'user', content: 'is distrokid going to set its own upc and isrc?' },
        { role: 'assistant', content: 'Error: Unauthorized' },
      ],
    })
    expectNextStepOnly(suggestion)
    expect(suggestion).toMatch(/Unauthorized/)
    expect(suggestion).toMatch(/Sign in again/)
    expect(suggestion.toLowerCase()).not.toContain('is distrokid going to set')
  })

  it('turns the assistant UPC mismatch into the write to approve', () => {
    const answer = [
      'DistroKid UPC (live, going to stores): 700563968501',
      'Release Studio UPC (currently stored): 0199980184428',
      'These must match. The DistroKid code is authoritative.',
    ].join('\n')
    const suggestion = composerGhostSuggestion({
      messages: [
        { role: 'user', content: 'what should we do?' },
        { role: 'assistant', content: answer },
      ],
    })
    expectNextStepOnly(suggestion)
    expect(suggestion).toBe('Approve the Studio UPC write from 0199980184428 to 700563968501.')
  })

  it('uses the assistant recommendation when the reply stalls on login', () => {
    const reply = [
      'Short answer: Yes, by default — but you have options.',
      'Recommendation for SERGIK',
      '| Scenario | Action |',
      '| New original track, no prior release | Let DistroKid assign — fine |',
      '| Track previously released elsewhere | Supply the original ISRC |',
    ].join('\n')
    const suggestion = composerGhostSuggestion({
      messages: [
        {
          role: 'user',
          content: 'use our isrc codes generated how can we fix this?',
        },
        {
          role: 'assistant',
          content: reply,
          toolSteps: [{ summary: 'Opened https://sergikdropz.com/admin/login. Admin Login Sign In' }],
        },
      ],
    })
    expectNextStepOnly(suggestion)
    expect(suggestion).toMatch(/Let DistroKid assign/)
    expect(suggestion).toMatch(/Admin Login/)
    expect(suggestion.toLowerCase()).not.toContain('use our isrc codes')
  })

  it('picks the assistant’s recommended choice as the message', () => {
    const suggestion = composerGhostSuggestion({
      messages: [
        { role: 'user', content: 'Draft the Spotify pitch for the single' },
        { role: 'assistant', content: 'Want me to draft the Spotify pitch, or the press blurb?' },
      ],
    })
    expectNextStepOnly(suggestion)
    expect(suggestion).toMatch(/Spotify pitch/)
    expect(suggestion.toLowerCase()).not.toContain('draft the spotify pitch for the single')
  })

  it('keeps the workflow suggestion and arms the later step for the release date', () => {
    const reply = [
      "Understood. Here's the plan and the state of play:",
      'The right workflow from here',
      'Wait — let DistroKid deliver to stores. The release date is Oct 8, 2026.',
      'Pull the DK ISRCs — once the album is live, copy each track ISRC from the DistroKid album page.',
      'Write them into Release Studio — patch those codes into the catalog tracks.',
    ].join('\n')
    const suggestion = composerGhostSuggestion({
      now: new Date(2026, 9, 4, 12, 0, 0),
      messages: [
        { role: 'user', content: 'use our isrc codes generated how can we fix this?' },
        { role: 'assistant', content: reply },
      ],
    })
    expect(suggestion).toBe(
      'After DistroKid delivers on Oct 8, 2026, copy each DistroKid ISRC into this release.',
    )
    const armed = planArmedPrompt(reply, new Date(2026, 9, 4, 12, 0, 0))
    expect(armed?.prompt).toBe('Copy each DistroKid ISRC into this release.')
    const when = new Date(armed!.runAt)
    expect(when.getFullYear()).toBe(2026)
    expect(when.getMonth()).toBe(9)
    expect(when.getDate()).toBe(8)
    expect(when.getHours()).toBe(9)
    expect(when.getMinutes()).toBe(0)
  })

  it('uses a named clock time and does not arm a date that has already passed', () => {
    const reply = [
      'The right workflow from here',
      'Wait — let DistroKid deliver to stores. The release date is Oct 8, 2026 at 3:30 PM.',
      'Pull the DK ISRCs — copy each track ISRC from the DistroKid album page.',
    ].join('\n')
    const armed = planArmedPrompt(reply, new Date(2026, 9, 4, 12, 0, 0))
    const when = new Date(armed!.runAt)
    expect(when.getHours()).toBe(15)
    expect(when.getMinutes()).toBe(30)
    expect(planArmedPrompt(reply, new Date(2026, 9, 8, 16, 0, 0))).toBeNull()
  })

  it('lets a held submit beat a workflow that is still waiting', () => {
    const suggestion = composerGhostSuggestion({
      now: '2026-10-04T15:00:00Z',
      heldWrite: 'Release UPC 700563968501 — submit',
      messages: [
        {
          role: 'assistant',
          content: [
            'The right workflow from here',
            'Wait — let DistroKid deliver to stores. The release date is Oct 8, 2026.',
            'Pull the DK ISRCs — copy each track ISRC from the DistroKid album page.',
          ].join('\n'),
        },
      ],
    })
    expect(suggestion).toBe('Approve the Studio UPC write for 700563968501.')
  })

  it('follows the focused field instead of the chat workflow', () => {
    const suggestion = composerGhostSuggestion({
      focus: {
        fieldLabel: 'Genre',
        section: 'Metadata',
        entityLabel: 'Staying A Vibe',
        value: '',
      },
      messages: [
        {
          role: 'assistant',
          content: [
            'The right workflow from here',
            'Wait — let DistroKid deliver to stores. The release date is Oct 8, 2026.',
          ].join('\n'),
        },
      ],
    })
    expect(suggestion).toBe('Draft a strong value for Genre (Metadata, Staying A Vibe).')
  })

  it('includes the current field value when asking for a refinement', () => {
    expect(
      composerGhostSuggestion({
        focus: { fieldLabel: 'Spotify pitch', fieldType: 'textarea', value: 'Late-night house for the room that stays.' },
      }),
    ).toBe(
      'Suggest a refined value for Spotify pitch. Current value: Late-night house for the room that stays.',
    )
  })

  it('follows the latest assistant intent instead of a scraped page or a scroll status', () => {
    const suggestion = composerGhostSuggestion({
      messages: [
        {
          role: 'assistant',
          content: [
            'The right workflow from here',
            'Wait — let DistroKid deliver to stores. The release date is Oct 8, 2026.',
            'Pull the DK ISRCs — once the album is live, copy each track ISRC.',
          ].join('\n'),
        },
        {
          role: 'assistant',
          content: [
            'The page is truncating the track list. Let me navigate to the ISRC-specific page for this album.',
            '© DistroKid 2026 Privacy policy Cookie policy Terms of use',
            'Store Maximizer will automatically deliver this album to new stores as they are added over time and beyond.',
          ].join('\n'),
          toolSteps: [{ summary: 'Scrolled the page.' }],
        },
      ],
    })
    expect(suggestion).toBe('Navigate to the ISRC-specific page for this album.')
  })

  it('advances past a step the tools already finished', () => {
    const suggestion = composerGhostSuggestion({
      now: new Date(2026, 9, 4, 12, 0, 0),
      messages: [
        {
          role: 'assistant',
          content: [
            'The right workflow from here',
            'Wait — let DistroKid deliver to stores. The release date is Oct 8, 2026.',
            'Pull the DK ISRCs — once the album is live, copy each track ISRC.',
          ].join('\n'),
        },
        {
          role: 'assistant',
          content: 'The page is truncating the track list. Let me navigate to the ISRC-specific page for this album.',
          toolSteps: [{ summary: 'Opened https://distrokid.com/album/isrc' }],
        },
      ],
    })
    expect(suggestion).toBe('Copy each DistroKid ISRC into this release.')
    expect(suggestion).not.toMatch(/Navigate/)
  })

  it('offers one upgrade once the goal’s steps are finished', () => {
    const suggestion = composerGhostSuggestion({
      now: new Date(2026, 9, 4, 12, 0, 0),
      goal: 'Match the DistroKid codes on Staying A Vibe',
      releaseTitle: 'Staying A Vibe',
      messages: [
        {
          role: 'assistant',
          content: [
            'The right workflow from here',
            'Wait — let DistroKid deliver to stores. The release date is Oct 8, 2026.',
            'Pull the DK ISRCs — once the album is live, copy each track ISRC.',
          ].join('\n'),
        },
        {
          role: 'assistant',
          content: 'Copied each DistroKid ISRC into Release Studio. The codes match DistroKid.',
          toolSteps: [{ summary: 'Patched ISRCs into the studio tracks.' }],
        },
      ],
    })
    expect(suggestion).toBe(
      'Draft a Spotify pitch for Staying A Vibe from the catalog facts already in this chat, aimed at the Oct 8, 2026 drop.',
    )
    expect(suggestion).not.toMatch(/Navigate|Copy each DistroKid ISRC/)
  })

  it('skips an upgrade the thread already covered', () => {
    const suggestion = composerGhostSuggestion({
      now: new Date(2026, 9, 9, 12, 0, 0),
      releaseTitle: 'Staying A Vibe',
      messages: [
        {
          role: 'assistant',
          content: 'Copied each DistroKid ISRC into Release Studio. Drafted the Spotify pitch. That is everything for this goal.',
        },
      ],
    })
    expect(suggestion).toMatch(/elevator pitch/i)
    expect(suggestion).not.toMatch(/Spotify pitch/)
  })

  it('prefers a missing cover over a generic pitch once the goal is done', () => {
    const suggestion = composerGhostSuggestion({
      releaseTitle: 'Staying A Vibe',
      studio: { hasArtwork: false, trackCount: 5, releaseDate: '2026-10-08' },
      messages: [
        {
          role: 'assistant',
          content: 'The Studio UPC now matches DistroKid. That is everything for this goal.',
        },
      ],
    })
    expect(suggestion).toBe('Attach final cover art for Staying A Vibe so the stores are not waiting on a placeholder.')
  })

  it('does not invent an upgrade while a workflow step is still open', () => {
    const suggestion = composerGhostSuggestion({
      now: new Date(2026, 9, 4, 12, 0, 0),
      releaseTitle: 'Staying A Vibe',
      studio: { hasArtwork: false },
      messages: [
        {
          role: 'assistant',
          content: [
            'The right workflow from here',
            'Wait — let DistroKid deliver to stores. The release date is Oct 8, 2026.',
            'Pull the DK ISRCs — once the album is live, copy each track ISRC.',
          ].join('\n'),
        },
      ],
    })
    expect(suggestion).toBe(
      'After DistroKid delivers on Oct 8, 2026, copy each DistroKid ISRC into this release.',
    )
  })

  it('does not treat an unrelated already-written note as finished ISRC work', () => {
    const suggestion = composerGhostSuggestion({
      now: new Date(2026, 9, 4, 12, 0, 0),
      messages: [
        {
          role: 'assistant',
          content: [
            'The right workflow from here',
            '1. Wait — let DistroKid deliver to stores. The release date is Oct 8, 2026.',
            '2. Pull the DK ISRCs — once the album is live, copy each track ISRC.',
            '3. Write them into Release Studio — patch them into the catalog tracks.',
            '- Use the spotify_pitch field from Studio (already written):',
          ].join('\n'),
        },
        {
          role: 'assistant',
          content: 'The page is truncating the track list. Let me navigate to the ISRC-specific page for this album.',
          toolSteps: [{ summary: 'Opened https://distrokid.com/dashboard/album/?albumuuid=D908E9D1' }],
        },
      ],
    })
    expect(suggestion).toBe('Navigate to the ISRC-specific page for this album.')
  })

  it('closes the studio write once the ISRCs are actually patched', () => {
    const suggestion = composerGhostSuggestion({
      now: new Date(2026, 9, 4, 12, 0, 0),
      releaseTitle: 'Staying A Vibe',
      messages: [
        {
          role: 'assistant',
          content: [
            'The right workflow from here',
            'Wait — let DistroKid deliver to stores. The release date is Oct 8, 2026.',
            'Pull the DK ISRCs — copy each track ISRC.',
            'Write them into Release Studio — patch them into the catalog tracks.',
          ].join('\n'),
        },
        {
          role: 'assistant',
          content: 'Copied each DistroKid ISRC into Release Studio.',
          toolSteps: [{ summary: 'Patched ISRCs into the studio tracks.' }],
        },
      ],
    })
    expect(suggestion).toMatch(/Spotify pitch for Staying A Vibe/)
    expect(suggestion).not.toMatch(/Write them into Release Studio/)
  })

  it('builds the payload from the draft already in the chat instead of asking to paste it', () => {
    const messages = [
      {
        role: 'assistant',
        content: [
          'Subject: The vibe does not stop.',
          'Preview text: New EP. Out soon.',
          'Body:',
          'STAYING A VIBE',
          'Pre-save the EP before it drops.',
        ].join('\n'),
      },
      {
        role: 'user',
        content:
          'Load this into the "Staying A Vibe - Release Campaign" draft and generate a generate_campaign_draft payload for approval',
      },
      {
        role: 'assistant',
        content: [
          'Campaign: "Staying A Vibe - Release Campaign"',
          'ID: `fa30c366-b591-4a33-bfb4-6a622a5530a3`',
          'Scheduled send: 2026-10-08',
          'Smartlink slug:** `presave-stay`',
          'Smartlink ID: `c75b5d62-56e5-4ca1-8ef5-9e64693d7881`',
          'You did not paste the content yet. Could you paste it here?',
          'Paste the copy and I will build the approval payload immediately.',
        ].join('\n'),
      },
    ]
    const suggestion = composerGhostSuggestion({ messages, releaseTitle: 'Staying A Vibe' })
    expect(suggestion).toBe('Build the approval payload from this draft.')
    expect(suggestion.toLowerCase()).not.toContain('paste the copy')
    const followUps = recommendReplyFollowUps({ messages, releaseTitle: 'Staying A Vibe' })
    expect(followUps.map((item) => item.label)).toEqual([
      'Build the approval payload from this draft',
      'Tighten the subject, preview, and call to action',
      'Confirm the 2026-10-08 send, then build the payload',
    ])
    expect(followUps[0]?.message).toContain('fa30c366-b591-4a33-bfb4-6a622a5530a3')
    expect(followUps[0]?.message).toContain('generate_campaign_draft')
    expect(followUps[0]?.message).toContain('smartlink slug presave-stay')
    expect(followUps[0]?.message).toContain('already drafted in this chat')
    expect(followUps[0]?.message.toLowerCase()).not.toContain('paste')
  })

  it('offers the open workflow step and a useful wait-time step', () => {
    const messages = [
      {
        role: 'assistant',
        content: [
          'The right workflow from here',
          'Wait — let DistroKid deliver to stores. The release date is Oct 8, 2026.',
          'Pull the DK ISRCs — once the album is live, copy each track ISRC.',
        ].join('\n'),
      },
    ]
    const followUps = recommendReplyFollowUps({
      now: new Date(2026, 9, 4, 12, 0, 0),
      releaseTitle: 'Staying A Vibe',
      messages,
    })
    expect(followUps[0]?.message).toMatch(/After DistroKid delivers on Oct 8, 2026/)
    expect(followUps.map((item) => item.label).join('\n')).toMatch(/Prepare the Studio fields/)
    expect(followUps.some((item) => /spotify pitch/i.test(item.label))).toBe(false)
  })

  it('ghosts the next read after a tool status line', () => {
    expect(
      composerGhostSuggestion({
        messages: [
          { role: 'user', content: '/exec query_ops_snapshot {"focus":"nurturing"}' },
          { role: 'assistant', content: 'Preview created. Approval required before execution.' },
          { role: 'assistant', content: 'query_ops_snapshot executed.' },
        ],
      }),
    ).toBe('Read the nurturing snapshot and name the next action.')
  })

  it('ghosts approval when a preview has not run', () => {
    expect(
      composerGhostSuggestion({
        messages: [
          { role: 'user', content: '/exec query_ops_snapshot {"focus":"nurturing"}' },
          { role: 'assistant', content: 'Preview created. Approval required before execution.' },
        ],
      }),
    ).toBe('Approve the preview and run it.')
  })

  it('stays empty when the assistant has not replied', () => {
    expect(
      composerGhostSuggestion({
        messages: [{ role: 'user', content: 'is distrokid going to set its own upc and isrc?' }],
      }),
    ).toBe('')
  })
})
