const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function printfulOrderMatch(order: {
  id?: string | number | null
  external_id?: string | null
} | null | undefined): { printfulOrderId: string | null; merchOrderId: string | null } {
  const printfulOrderId = order?.id != null && order.id !== '' ? String(order.id) : null
  const external = order?.external_id?.trim() || ''
  return {
    printfulOrderId,
    merchOrderId: UUID_RE.test(external) ? external : null,
  }
}
