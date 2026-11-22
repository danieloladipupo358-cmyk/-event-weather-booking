import { createContext } from 'react'
import type { EventItem } from '../services/eventService'

export type EventState = { events: EventItem[]; loading: boolean; error: string }
export const EventContext = createContext<EventState | null>(null)
