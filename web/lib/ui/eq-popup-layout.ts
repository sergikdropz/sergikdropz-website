/** Compact iDJ EQ card — keep in sync with `w-[5.5rem]` + compact VerticalFader. */
export const EQ_POPUP_WIDTH = 88
export const EQ_POPUP_HEIGHT = 268
export const EQ_POPUP_GAP = 8

export type EqPopupBox = {
  key: string
  left: number
  top: number
  width: number
  height: number
}

export type EqPopupBand = 'low' | 'mid' | 'high'
export type EqPopupDeck = 'a' | 'b'

export type EqPopupAnchor = {
  key: string
  deck: EqPopupDeck
  band: EqPopupBand
  centerX: number
  top: number
}

/** Screen-space keep-out (typically the crossfader). */
export type EqPopupKeepOut = {
  left: number
  right: number
}

const BAND_ORDER: Record<EqPopupBand, number> = { low: 0, mid: 1, high: 2 }

function packDeckRow(
  anchors: EqPopupAnchor[],
  minLeft: number,
  maxRight: number,
  /** If the row is wider than the lane, hang off this side so the XF stays clear. */
  hang: 'left' | 'right' = 'left',
): EqPopupBox[] {
  const ordered = [...anchors].sort((a, b) => BAND_ORDER[a.band] - BAND_ORDER[b.band])
  if (ordered.length === 0) return []

  const n = ordered.length
  const rowWidth = n * EQ_POPUP_WIDTH + (n - 1) * EQ_POPUP_GAP
  const top = Math.max(
    EQ_POPUP_GAP,
    Math.min(...ordered.map((a) => a.top)) - EQ_POPUP_HEIGHT - 6,
  )

  let start = ordered[0].centerX - EQ_POPUP_WIDTH / 2
  if (start + rowWidth > maxRight) start = maxRight - rowWidth
  if (start < minLeft) start = minLeft
  if (start + rowWidth > maxRight) {
    start = hang === 'right' ? minLeft : maxRight - rowWidth
  }

  return ordered.map((anchor, i) => ({
    key: anchor.key,
    left: start + i * (EQ_POPUP_WIDTH + EQ_POPUP_GAP),
    top,
    width: EQ_POPUP_WIDTH,
    height: EQ_POPUP_HEIGHT,
  }))
}

function deckLanes(
  viewportWidth: number,
  keepOut?: EqPopupKeepOut | null,
): { a: { min: number; max: number }; b: { min: number; max: number } } {
  const edge = EQ_POPUP_GAP
  const viewLeft = edge
  const viewRight = Math.max(edge + EQ_POPUP_WIDTH, viewportWidth - edge)
  if (keepOut && keepOut.right > keepOut.left) {
    return {
      a: { min: viewLeft, max: Math.max(viewLeft + EQ_POPUP_WIDTH, keepOut.left - EQ_POPUP_GAP) },
      b: { min: Math.min(viewRight - EQ_POPUP_WIDTH, keepOut.right + EQ_POPUP_GAP), max: viewRight },
    }
  }
  return {
    a: { min: viewLeft, max: viewRight },
    b: { min: viewLeft, max: viewRight },
  }
}

/** Place cards in one horizontal row per deck: Low → Mid → High, never stacked, never over XF. */
export function layoutEqPopupBoxes(
  anchors: EqPopupAnchor[],
  viewportWidth: number,
  keepOut?: EqPopupKeepOut | null,
): EqPopupBox[] {
  const lanes = deckLanes(viewportWidth, keepOut)
  const deckA = anchors.filter((a) => a.deck === 'a')
  const deckB = anchors.filter((a) => a.deck === 'b')

  if (!keepOut && deckA.length > 0 && deckB.length > 0) {
    const aRight = Math.max(...deckA.map((a) => a.centerX))
    const bLeft = Math.min(...deckB.map((a) => a.centerX))
    const divider = (aRight + bLeft) / 2
    return [
      ...packDeckRow(
        deckA,
        lanes.a.min,
        Math.max(lanes.a.min + EQ_POPUP_WIDTH, divider - EQ_POPUP_GAP / 2),
        'left',
      ),
      ...packDeckRow(
        deckB,
        Math.min(lanes.b.max - EQ_POPUP_WIDTH, divider + EQ_POPUP_GAP / 2),
        lanes.b.max,
        'right',
      ),
    ]
  }

  return [
    ...packDeckRow(deckA, lanes.a.min, lanes.a.max, 'left'),
    ...packDeckRow(deckB, lanes.b.min, lanes.b.max, 'right'),
  ]
}
