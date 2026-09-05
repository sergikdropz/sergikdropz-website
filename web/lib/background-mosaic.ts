/** 4-connected neighbors (no diagonals) so identical tiles never sit edge-to-edge. */
export function neighborIndexes(cell: number, cols: number, cellCount: number): number[] {
  if (cols < 1 || cell < 0 || cell >= cellCount) return []
  const row = Math.floor(cell / cols)
  const col = cell % cols
  const rows = Math.ceil(cellCount / cols)
  const out: number[] = []
  if (col > 0) out.push(cell - 1)
  if (col < cols - 1 && cell + 1 < cellCount) out.push(cell + 1)
  if (row > 0) out.push(cell - cols)
  if (row + 1 < rows && cell + cols < cellCount) out.push(cell + cols)
  return out
}

function shuffleOrder(length: number): number[] {
  const order = Array.from({ length }, (_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

function maxCopiesForPool(poolSize: number, cellCount: number): number {
  if (poolSize <= 0) return 1
  return Math.max(1, Math.ceil(cellCount / poolSize))
}

export function hasAdjacentDuplicate(grid: number[], cols: number): boolean {
  for (let cell = 0; cell < grid.length; cell++) {
    const value = grid[cell]
    if (value < 0) continue
    for (const n of neighborIndexes(cell, cols, grid.length)) {
      if (grid[n] === value) return true
    }
  }
  return false
}

function pickTileIndex(
  poolSize: number,
  cell: number,
  grid: number[],
  cols: number,
  avoidCurrent: boolean,
): number {
  if (poolSize <= 0) return 0

  const maxCopies = maxCopiesForPool(poolSize, grid.length)
  const usedCounts = new Map<number, number>()
  for (let i = 0; i < grid.length; i++) {
    if (i === cell || grid[i] < 0) continue
    usedCounts.set(grid[i], (usedCounts.get(grid[i]) || 0) + 1)
  }

  const neighborValues = new Set(
    neighborIndexes(cell, cols, grid.length)
      .map((i) => grid[i])
      .filter((v) => v >= 0),
  )
  const current = grid[cell]

  const uniqueNonAdjacent: number[] = []
  const unusedNonAdjacent: number[] = []
  const underCapNonAdjacent: number[] = []
  const nonAdjacent: number[] = []
  const fallback: number[] = []

  for (let i = 0; i < poolSize; i++) {
    if (avoidCurrent && i === current) continue
    const copies = usedCounts.get(i) || 0
    const adjacent = neighborValues.has(i)
    const unused = copies === 0
    const underCap = copies < maxCopies

    if (unused && !adjacent) uniqueNonAdjacent.push(i)
    else if (unused) unusedNonAdjacent.push(i)
    else if (underCap && !adjacent) underCapNonAdjacent.push(i)
    else if (!adjacent) nonAdjacent.push(i)
    else fallback.push(i)
  }

  const pool =
    uniqueNonAdjacent[0] !== undefined
      ? uniqueNonAdjacent
      : unusedNonAdjacent[0] !== undefined
        ? unusedNonAdjacent
        : underCapNonAdjacent[0] !== undefined
          ? underCapNonAdjacent
          : nonAdjacent[0] !== undefined
            ? nonAdjacent
            : fallback.length
              ? fallback
              : Array.from({ length: poolSize }, (_, i) => i)

  return pool[Math.floor(Math.random() * pool.length)] ?? 0
}

export function buildMosaicGrid(poolSize: number, cellCount: number, cols: number): number[] {
  if (poolSize <= 0 || cellCount <= 0) return []

  let best: number[] = []
  for (let attempt = 0; attempt < 16; attempt++) {
    const grid = Array.from({ length: cellCount }, () => -1)
    for (const cell of shuffleOrder(cellCount)) {
      grid[cell] = pickTileIndex(poolSize, cell, grid, cols, false)
    }
    for (let cell = 0; cell < cellCount; cell++) {
      if (neighborIndexes(cell, cols, cellCount).some((n) => grid[n] === grid[cell])) {
        grid[cell] = pickTileIndex(poolSize, cell, grid, cols, true)
      }
    }
    best = grid
    if (!hasAdjacentDuplicate(grid, cols)) return grid
  }
  return best
}

export function swapMosaicCells(
  grid: number[],
  poolSize: number,
  cols: number,
  changeCount: number,
): number[] {
  if (grid.length === 0 || poolSize <= 0) return grid
  const next = [...grid]
  const count = Math.max(1, Math.min(grid.length, changeCount))
  const cells = shuffleOrder(grid.length).slice(0, count)
  for (const cell of cells) {
    next[cell] = pickTileIndex(poolSize, cell, next, cols, true)
  }
  return next
}

export function mosaicGridCols(isMobile: boolean): number {
  return isMobile ? 2 : 3
}
