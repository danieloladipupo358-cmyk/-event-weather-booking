import { useContext } from 'react'
import { EventContext } from './context'

export function useEvents() {
  const context = useContext(EventContext)
  if (!context) throw new Error('useEvents must be used inside EventProvider')
  return context
}
