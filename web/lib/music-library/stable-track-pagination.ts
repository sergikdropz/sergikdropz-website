/**
 * Offset pagination requires a deterministic ORDER BY — tie-break on id + title.
 */

type OrderableQuery = {
  order: (
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean },
  ) => OrderableQuery
}

export function applyStableTrackPaginationOrder<T extends OrderableQuery>(
  query: T,
  primary: { column: string; ascending: boolean; nullsFirst?: boolean },
): T {
  let next = query.order(primary.column, {
    ascending: primary.ascending,
    ...(primary.nullsFirst != null ? { nullsFirst: primary.nullsFirst } : {}),
  })
  if (primary.column !== 'title') {
    next = next.order('title', { ascending: true })
  }
  return next.order('id', { ascending: true }) as T
}
