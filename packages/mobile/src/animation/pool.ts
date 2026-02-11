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
  const queue: Array<{ id: number; activate: () => void }> = []
  let nextID = 0

  function request(activate: () => void): { id: number; queued: boolean } {
    const id = nextID++
    if (active < limit) {
      active++
      activate()
      return { id, queued: false }
    }
    queue.push({ id, activate })
    return { id, queued: true }
  }

  function cancel(id: number) {
    const index = queue.findIndex((item) => item.id === id)
    if (index >= 0) {
      queue.splice(index, 1)
    }
  }

  function release() {
    active = Math.max(0, active - 1)
    // Drain queue in batches when backlog is large
    const batch = queue.length > 10 ? Math.min(3, queue.length) : 1
    for (let i = 0; i < batch && queue.length > 0; i++) {
      const next = queue.shift()?.activate
      if (next) {
        active++
        next()
      }
    }
  }

  return function usePool() {
    const [isActive, setIsActive] = useState(false)
    const mounted = useRef(true)
    const queuedID = useRef<number | null>(null)
    const claimed = useRef(false)
    const released = useRef(false)

    useEffect(() => {
      mounted.current = true
      const requested = request(() => {
        if (mounted.current) setIsActive(true)
        claimed.current = true
      })
      if (requested.queued) queuedID.current = requested.id
      return () => {
        mounted.current = false
        if (queuedID.current !== null) {
          cancel(queuedID.current)
          queuedID.current = null
        }
        if (claimed.current && !released.current) {
          released.current = true
          release()
        }
      }
    }, [])

    const evict = useCallback(() => {
      if (released.current) return
      released.current = true
      release()
    }, [])

    return { active: isActive, evict }
  }
}
