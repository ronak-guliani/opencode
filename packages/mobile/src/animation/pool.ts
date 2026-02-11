import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Pool-based animation scheduler (v0 pattern).
 * Limits concurrent fade-in animations to `limit` at a time.
 * Items queue up and are activated in order.
 *
 * Each consumer calls the returned hook to get `{ active, evict }`.
 * When a slot opens (another consumer evicts), the next queued item activates.
 */
export function createUsePool(limit: number) {
  let active = 0
  const queue: Array<() => void> = []

  function request(activate: () => void) {
    if (active < limit) {
      active++
      activate()
      return
    }
    queue.push(activate)
  }

  function release() {
    active = Math.max(0, active - 1)
    // Drain queue in batches when backlog is large
    const batch = queue.length > 10 ? Math.min(3, queue.length) : 1
    for (let i = 0; i < batch && queue.length > 0; i++) {
      const next = queue.shift()
      if (next) {
        active++
        next()
      }
    }
  }

  return function usePool() {
    const [isActive, setIsActive] = useState(false)
    const mounted = useRef(true)

    useEffect(() => {
      mounted.current = true
      request(() => {
        if (mounted.current) setIsActive(true)
      })
      return () => {
        mounted.current = false
      }
    }, [])

    const evict = useCallback(() => {
      release()
    }, [])

    return { active: isActive, evict }
  }
}
