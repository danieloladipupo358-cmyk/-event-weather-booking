import { apiRequest } from './api'

export type EventItem = { id:string; title:string; category:string; date:string; day:string; month:string; time:string; venue:string; city:string; price:number; image:string; color:string; lat:number; lon:number; description:string; isOutdoor:boolean }
type ApiEvent = { id:string; title:string; description:string; category:string; venue:string; city:string; latitude:number; longitude:number; startsAt:string; price:number; imageUrl:string|null; isOutdoor:boolean }

function present(event: ApiEvent): EventItem {
  const startsAt = new Date(event.startsAt)
  return { id:event.id,title:event.title,category:event.category,date:startsAt.toISOString().slice(0,10),day:new Intl.DateTimeFormat('en',{day:'2-digit',timeZone:'UTC'}).format(startsAt),month:new Intl.DateTimeFormat('en',{month:'short',timeZone:'UTC'}).format(startsAt).toUpperCase(),time:new Intl.DateTimeFormat('en',{hour:'numeric',minute:'2-digit',timeZone:'UTC'}).format(startsAt),venue:event.venue,city:event.city,price:event.price,image:event.imageUrl||'',color:'#dcece6',lat:event.latitude,lon:event.longitude,description:event.description,isOutdoor:event.isOutdoor }
}

export const eventService = {
  async list() { return (await apiRequest<ApiEvent[]>('/events')).map(present) },
}
