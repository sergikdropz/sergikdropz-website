export type AdminChatActionChoice = {
  id: string
  label: string
  message: string
}

export type AdminChatActionChoiceSet = {
  options: AdminChatActionChoice[]
  proceedAll: AdminChatActionChoice | null
}

const OFFER_RE =
  /^(?:do you want me to|would you like me to|let me know if you want me to|would you rather|would you prefer|do you want|want me to|should we|shall we|should i|shall i|could i|can i|which should i|what should i|where should i|pick one|choose one)\b/i

const OFFER_STRIP_RE =
  /^(?:do you want me to|would you like me to|let me know if you want me to|would you rather|would you prefer|do you want|want me to|should we|shall we|should i|shall i|could i|can i)\s+/i

const WHICH_RE = /^(which|what|where) should i\b/i

const YES_NO_RE =
  /^(?:is|are|was|were|do|does|did|have|has|had|can|could|should|would|will|am)\b/i

const ACTION_START_RE =
  /^(?:pull|fix|tackle|assign|update|open|check|write|draft|register|export|import|sync|review|audit|fill|set|add|remove|change|switch|start|stop|run|build|send|save|copy|compare|leave|keep|use|skip|continue|finish|correct|resolve|match|apply|publish|upload|download|look|read|scan|list|show|get|fetch)\b/i

const FENCE_RE = /```(?:choices|choice|options)\s*\n([\s\S]*?)```/gi

/** Every admin chat: ask for a decision by ending with a choices fence the UI turns into buttons. */
export function adminChatActionChoicesPrompt(): string {
  return [
    'In every chat, when you ask the user to choose, confirm, or pick a next step, end the reply with a choices fence and nothing after it.',
    'One option per line, 2 to 5 lines, no bullets inside the fence. The chat turns each line into a button and adds Proceed with all.',
    'For a yes or no confirmation, the two lines are Yes and No.',
    'If you are not asking them to pick, omit the fence. Do not leave the choice only in prose.',
    'Example:',
    '```choices',
    'Pull the full track ISRC list',
    'Fix the genre conflict',
    '```',
  ].join('\n')
}

function normalize(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim()
}

function tidy(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/^["“”']+|["“”']+$/g, '')
    .replace(/^(?:[-*•]|\d+[.)])\s+/, '')
    .replace(/^(?:and|then)\s+/i, '')
    .replace(/[?.!;:]+$/g, '')
    .trim()
}

function capitalize(value: string): string {
  const text = tidy(value)
  if (!text) return text
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function paragraphsOf(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

function listItem(line: string): string | null {
  const match = line.trim().match(/^(?:[-*•]|\d+[.)])\s+(.+)$/)
  if (!match) return null
  const item = tidy(match[1])
  return item.length > 2 ? item : null
}

function listOnly(lines: string[]): string[] | null {
  if (lines.length < 2) return null
  const items = lines.map(listItem)
  if (items.some((item) => !item)) return null
  return items.filter((item): item is string => Boolean(item))
}

function paragraphLines(paragraph: string): string[] {
  return paragraph
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function offerBlock(paragraph: string): string[] | null {
  const lines = paragraphLines(paragraph)
  if (lines.length < 3) return null
  const head = lines[0]!.replace(/:\s*$/, '').trim()
  if (!OFFER_RE.test(head)) return null
  const items = lines.slice(1).map(listItem)
  if (items.some((item) => !item)) return null
  const clean = items.filter((item): item is string => Boolean(item))
  return clean.length >= 2 ? clean : null
}

function splitAlternatives(body: string): string[] {
  const hasOr = /\bor\b/i.test(body)
  const hasSlash = /\s\/\s/.test(body)
  if (!hasOr && !hasSlash) {
    const one = tidy(body)
    return one.length > 2 ? [one] : []
  }
  const parts = body
    .split(/\s*,\s*or\s+|\s+or\s+|\s+\/\s+|\s*,\s+/i)
    .map(tidy)
    .filter((part) => part.length > 2)
  return parts.length >= 2 ? parts : []
}

function whichRemainder(sentence: string): string | null {
  const bare = sentence.replace(/\?+$/, '').trim()
  if (!WHICH_RE.test(bare)) return null
  return bare
    .replace(WHICH_RE, '')
    .replace(/^(?:\s+(?:do|tackle|handle|start(?:\s+with)?|pick|choose))?(?:\s+(?:first|next))?\s*[:,]?\s*/i, '')
    .trim()
}

function bareOrQuestion(sentence: string): string[] {
  const bare = sentence.replace(/\?+$/, '').trim()
  if (OFFER_RE.test(bare) || WHICH_RE.test(bare)) return []
  if (!/\bor\b/i.test(bare) && !/\s\/\s/.test(bare)) return []
  const parts = splitAlternatives(bare)
  if (parts.length < 2) return []
  if (!parts.every((part) => ACTION_START_RE.test(part))) return []
  return parts
}

function fromOfferSentence(sentence: string): string[] {
  const bare = sentence.replace(/\?+$/, '').trim()
  const which = whichRemainder(bare)
  if (which != null) {
    if (!which) return []
    return splitAlternatives(which)
  }
  const colon = bare.match(/^([^:]{0,60}):\s+(.+)$/)
  if (colon && OFFER_RE.test(colon[1]!.trim())) {
    const listed = splitAlternatives(colon[2]!)
    if (listed.length >= 1) return listed
  }
  if (!OFFER_RE.test(bare)) return bareOrQuestion(bare)
  const body = bare.replace(OFFER_STRIP_RE, '').trim()
  if (body.length < 3) return []
  return splitAlternatives(body)
}

function questionsIn(paragraph: string): string[] {
  return paragraph
    .split(/(?<=\?)\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.includes('?'))
}

function trailingParagraphs(paragraphs: string[]): string[] {
  const tail: string[] = []
  const start = Math.max(0, paragraphs.length - 3)
  for (let i = paragraphs.length - 1; i >= start; i -= 1) {
    const paragraph = paragraphs[i]!
    const isQuestion = paragraph.includes('?')
    const isOfferList = Boolean(offerBlock(paragraph))
    if (!isQuestion && !isOfferList) break
    tail.unshift(paragraph)
  }
  return tail
}

function fenceOptions(content: string): string[] | null {
  const matches = [...content.matchAll(FENCE_RE)]
  if (!matches.length) return null
  const body = matches[matches.length - 1]?.[1] ?? ''
  const lines = body
    .split('\n')
    .map((line) => tidy(line))
    .filter((line) => line.length > 1)
  return lines.length ? lines : null
}

function labeledChoiceBlock(content: string): string[] | null {
  const match = content.match(/(?:^|\n)CHOICES:\s*\n([\s\S]*)$/i)
  if (!match) return null
  const lines = match[1]!
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length < 1 || lines.length > 5) return null
  const items = lines.map((line) => tidy(line))
  if (items.some((item) => item.length < 2 || item.length > 160)) return null
  return items
}

export function stripAdminChatActionChoiceMarkup(content: string): string {
  let next = content.replace(/```(?:choices|choice|options)\s*\n[\s\S]*?```/gi, '')
  if (labeledChoiceBlock(content)) {
    next = next.replace(/(?:^|\n)CHOICES:\s*\n[\s\S]*$/i, '')
  }
  return next.replace(/\n{3,}/g, '\n\n').trim()
}

function dedupe(options: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const option of options) {
    const key = option.toLowerCase()
    if (seen.has(key)) continue
    if (option.length > 160) continue
    seen.add(key)
    out.push(option)
  }
  return out.slice(0, 5)
}

function choiceId(label: string, index: number): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return `${index}-${slug || 'step'}`
}

function isYesNoPair(options: string[]): boolean {
  if (options.length !== 2) return false
  const keys = new Set(options.map((option) => option.toLowerCase()))
  return keys.has('yes') && keys.has('no')
}

const VAGUE_RUN_RE = /^(?:run|run this|run it|do it|do this|do that)$/i

function offerNearEnd(text: string): AdminChatActionChoiceSet | null {
  const paragraphs = paragraphsOf(text)
  const window: string[] = []
  for (let i = paragraphs.length - 1; i >= 0 && window.length < 4; i -= 1) {
    const paragraph = paragraphs[i]!
    const text = paragraph.replace(/\s+/g, ' ').trim()
    const closer =
      /^(?:your call|up to you|let me know|you decide|your choice)[.!]?$/i.test(text) ||
      (/\b(?:your call|up to you|you decide)[.!]?$/i.test(text) &&
        !/\b(?:shall i|should i|want me to|can i|do you want)\b/i.test(text))
    const code = paragraph.trim().startsWith('```') || paragraph.includes('/exec ')
    const offer = /\b(?:shall i|should i|want me to|can i|do you want)\b/i.test(paragraph)
    if (closer || code) {
      window.unshift(paragraph)
      continue
    }
    if (offer) {
      window.unshift(paragraph)
      break
    }
    return null
  }
  if (!window.length) return null

  const joined = window.join('\n')
  const headingParagraph = window.find((paragraph) =>
    /\b(?:shall i|should i|want me to|can i|do you want)\b/i.test(paragraph),
  )
  if (!headingParagraph) return null

  const heading = headingParagraph.split('\n')[0]!.replace(/[:?]+$/g, '').trim()
  const body = tidy(heading.replace(OFFER_STRIP_RE, ''))
  const execMatch = joined.match(/\/exec\s+[a-z0-9_]+\s+\{[\s\S]*?\}/i)
  const vague = !body || VAGUE_RUN_RE.test(body)

  if (vague && execMatch) {
    const description = execMatch[0].match(/"description"\s*:\s*"([^"]+)"/)?.[1]
    const label = capitalize(description || 'Run this step')
    return {
      options: [
        {
          id: 'run-step',
          label: label.length > 110 ? `${label.slice(0, 107)}…` : label,
          message: execMatch[0].replace(/\s+/g, ' ').trim(),
        },
      ],
      proceedAll: null,
    }
  }

  if (!vague && body.length > 2) return toChoiceSet([body])
  return null
}

function yesNoQuestion(paragraph: string): string | null {
  const questions = questionsIn(paragraph)
  if (questions.length !== 1) return null
  const question = questions[0]!
  if (/\bor\b/i.test(question)) return null
  const bare = question.replace(/\?+$/, '').trim()
  if (!YES_NO_RE.test(bare) || bare.length > 180) return null
  if (OFFER_RE.test(bare)) return null
  return question.trim()
}

function toChoiceSet(options: string[], contextQuestion?: string | null): AdminChatActionChoiceSet | null {
  const cleaned = dedupe(options)
  if (!cleaned.length) return null
  const yesNo = isYesNoPair(cleaned)
  const choices: AdminChatActionChoice[] = cleaned.map((option, index) => {
    const label = capitalize(option)
    const message =
      yesNo && contextQuestion
        ? `${label}. ${contextQuestion}`
        : `${label}.`
    return {
      id: choiceId(label, index),
      label,
      message,
    }
  })
  const proceedAll =
    choices.length >= 2 && !yesNo
      ? {
          id: 'proceed-all',
          label: 'Proceed with all with recommended steps for best results',
          message: `Proceed with all recommended steps for the best result, in this order unless a better order is obvious:\n${choices
            .map((choice, index) => `${index + 1}. ${choice.label}`)
            .join('\n')}`,
        }
      : null
  return { options: choices, proceedAll }
}

export function parseAdminChatActionChoices(content: string): AdminChatActionChoiceSet | null {
  const raw = content.replace(/\r\n/g, '\n').trim()
  if (!raw || raw.startsWith('Error:') || raw === 'Working…' || raw === '…') return null

  const fenced = fenceOptions(raw) ?? labeledChoiceBlock(raw)
  if (fenced) {
    const prose = normalize(stripAdminChatActionChoiceMarkup(raw))
    const paragraphs = paragraphsOf(prose)
    const lastQuestion = questionsIn(paragraphs[paragraphs.length - 1] ?? '').at(-1) ?? null
    return toChoiceSet(fenced, lastQuestion)
  }

  const text = normalize(raw)
  const paragraphs = paragraphsOf(text)
  if (!paragraphs.length) return null

  const tail = trailingParagraphs(paragraphs)
  if (!tail.length) return offerNearEnd(raw)

  const collected: string[] = []
  const previous = paragraphs[paragraphs.length - tail.length - 1] ?? ''

  for (const paragraph of tail) {
    const block = offerBlock(paragraph)
    if (block) {
      collected.push(...block)
      continue
    }
    const questions = questionsIn(paragraph)
    const needsList = questions.some((question) => whichRemainder(question.replace(/\?+$/, '').trim()) === '')
    if (needsList) {
      const lines = paragraphLines(paragraph)
      const questionAt = lines.findIndex((line) => line.includes('?'))
      const inlineItems = questionAt > 0 ? listOnly(lines.slice(0, questionAt)) : null
      const items = listOnly(paragraphLines(previous)) ?? inlineItems
      if (items) collected.push(...items)
    }
    for (const question of questions) {
      collected.push(...fromOfferSentence(question))
    }
  }

  const parsed = toChoiceSet(collected)
  if (parsed) return parsed

  const offered = offerNearEnd(raw)
  if (offered) return offered

  const last = tail[tail.length - 1] ?? ''
  const confirmation = yesNoQuestion(last)
  if (!confirmation) return null
  return toChoiceSet(['Yes', 'No'], confirmation)
}
