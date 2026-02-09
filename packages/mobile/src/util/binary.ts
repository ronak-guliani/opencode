/**
 * Binary search over a sorted array. Returns the index where the item is found
 * or should be inserted to maintain sort order.
 *
 * All store arrays (sessions, messages, parts) are sorted by ID to enable
 * O(log n) lookups and insertions — same pattern as the web app.
 */
export function search<T>(
  array: readonly T[],
  id: string,
  key: (item: T) => string,
): { found: boolean; index: number } {
  let left = 0
  let right = array.length - 1

  while (left <= right) {
    const mid = (left + right) >>> 1
    const val = key(array[mid])
    if (val === id) return { found: true, index: mid }
    if (val < id) left = mid + 1
    else right = mid - 1
  }

  return { found: false, index: left }
}

/**
 * Insert an item into a sorted array at the correct position.
 * Returns a new array (immutable).
 */
export function insert<T>(array: readonly T[], item: T, key: (item: T) => string): T[] {
  const id = key(item)
  const result = search(array, id, key)
  if (result.found) {
    const next = array.slice()
    next[result.index] = item
    return next
  }
  const next = array.slice()
  next.splice(result.index, 0, item)
  return next
}

/**
 * Remove an item from a sorted array by ID.
 * Returns a new array (immutable), or the original if not found.
 */
export function remove<T>(array: readonly T[], id: string, key: (item: T) => string): T[] {
  const result = search(array, id, key)
  if (!result.found) return array as T[]
  const next = array.slice()
  next.splice(result.index, 1)
  return next
}
