export function insert<T extends { id: string }>(arr: T[], item: T): T[] {
  const idx = search(arr, item.id)
  if (idx >= 0) {
    const next = [...arr]
    next[idx] = item
    return next
  }
  const pos = ~idx
  const next = [...arr]
  next.splice(pos, 0, item)
  return next
}

export function remove<T extends { id: string }>(arr: T[], id: string): T[] {
  const idx = search(arr, id)
  if (idx < 0) return arr
  const next = [...arr]
  next.splice(idx, 1)
  return next
}

export function search<T extends { id: string }>(arr: T[], id: string): number {
  let lo = 0
  let hi = arr.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    const cmp = arr[mid].id.localeCompare(id)
    if (cmp === 0) return mid
    if (cmp < 0) lo = mid + 1
    else hi = mid - 1
  }
  return ~lo
}
