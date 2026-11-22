import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { eventService, type EventItem } from '../services/eventService'
import { EventContext } from './context'

export function EventProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<EventItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    eventService.list().then(data => { if (active) setEvents(data) }).catch(err => { if (active) setError(err instanceof Error ? err.message : 'Could not load events.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const value = useMemo(() => ({ events, loading, error }), [events, loading, error])
  return <EventContext.Provider value={value}>{children}</EventContext.Provider>
}
