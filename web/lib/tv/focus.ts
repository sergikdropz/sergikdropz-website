export type TvFocus = {
  row: number
  col: number
}

/** Move a D-pad highlight across shelves. Stops at the ends of a row. */
export function moveTvFocus(focus: TvFocus, key: string, rowLengths: number[]): TvFocus {
  const lengths = rowLengths.filter((length) => length > 0)
  if (lengths.length === 0) return { row: 0, col: 0 }

  let row = clamp(focus.row, 0, lengths.length - 1)
  let col = clamp(focus.col, 0, lengths[row] - 1)

  if (key === 'ArrowRight') col = Math.min(col + 1, lengths[row] - 1)
  if (key === 'ArrowLeft') col = Math.max(col - 1, 0)
  if (key === 'ArrowDown' || key === 'ArrowUp') {
    row = key === 'ArrowDown' ? Math.min(row + 1, lengths.length - 1) : Math.max(row - 1, 0)
    col = Math.min(col, lengths[row] - 1)
  }

  return { row, col }
}

/** Samsung Tizen sends 10009. LG webOS sends 461. Browsers send Escape. */
export function isTvBackKey(key: string, keyCode = 0): boolean {
  if (key === 'Escape' || key === 'Backspace' || key === 'GoBack' || key === 'BrowserBack' || key === 'XF86Back') {
    return true
  }
  return keyCode === 461 || keyCode === 10009
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
