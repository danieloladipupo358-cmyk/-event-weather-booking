import { apiRequest } from './api'

export type Booking = { id: string; eventId: string; quantity: number; status: 'CONFIRMED' | 'CANCELLED'; event: { id: string; title: string; startsAt: string; venue: string; city: string; price: number; imageUrl: string | null }; createdAt: string }

export const bookingService = {
  listMine: () => apiRequest<Booking[]>('/bookings/me'),
  create: (input: { eventId: string; quantity: number }) => apiRequest<Booking>('/bookings', { method: 'POST', body: JSON.stringify(input) }),
  cancel: (id: string) => apiRequest<Booking>(`/bookings/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
}
