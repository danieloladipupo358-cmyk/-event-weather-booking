import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import express, { type NextFunction, type Request, type Response } from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { Prisma, PrismaClient, UserRole } from '@prisma/client'
import { z } from 'zod'

const app = express()
const prisma = new PrismaClient()
const port = Number(process.env.PORT || 4000)
const jwtSecret = process.env.JWT_SECRET
const authConfigured = Boolean(jwtSecret && jwtSecret.length >= 32)
const sessionCookie = 'setmore_session'
const sessionLifetimeMs = 12 * 60 * 60 * 1000
const cookieSameSite = process.env.COOKIE_SAME_SITE === 'none' ? 'none' as const : 'lax' as const
const cookieSecure = process.env.NODE_ENV === 'production' || cookieSameSite === 'none'
const cookieOptions = { httpOnly: true, secure: cookieSecure, sameSite: cookieSameSite, path: '/', maxAge: sessionLifetimeMs }
const allowedOrigins = new Set((process.env.CUSTOMER_ORIGIN || 'http://localhost:5173').split(',').map(origin => origin.trim()))
const demoAuthEnabled = process.env.DEMO_AUTH === 'true' && process.env.NODE_ENV !== 'production'
const demoAdminEmail = process.env.DEMO_ADMIN_EMAIL?.trim().toLowerCase()
const demoUsersFile = resolve(process.cwd(), '.demo-users.json')

type DemoUser = { id: string; name: string; email: string; passwordHash: string; role: UserRole; createdAt: string }
async function readDemoUsers(): Promise<DemoUser[]> {
  try { return JSON.parse(await readFile(demoUsersFile, 'utf8')) as DemoUser[] }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
}
async function writeDemoUsers(users: DemoUser[]) { await writeFile(demoUsersFile, JSON.stringify(users, null, 2), { mode: 0o600 }) }
function toPublicDemoUser(user: DemoUser) { return { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt } }

if (!authConfigured) console.warn('A JWT_SECRET with at least 32 characters is required. Auth routes are disabled until apps/api/.env is configured.')
if (demoAuthEnabled) console.warn('DEMO_AUTH is enabled. Demo user records are local to this server and are not for production.')
app.disable('x-powered-by')
app.use(helmet())
app.use(cors({ origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)), credentials: true }))
app.use('/api', (req, res, next) => {
  const origin = req.get('origin')
  if (origin && !allowedOrigins.has(origin)) return res.status(403).json({ error: 'Request origin is not allowed.' })
  return next()
})
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }))

type AuthRequest = Request & { user?: { id: string; role: UserRole }; demoUser?: DemoUser }
type HttpError = Error & { status?: number }

function signSession(user: { id: string; role: UserRole }) {
  if (!authConfigured || !jwtSecret) throw Object.assign(new Error('Authentication is not configured'), { status: 503 })
  return jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: '12h', issuer: 'setmore-api', audience: 'setmore-web' })
}

async function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.[sessionCookie] as string | undefined
  if (!token || !jwtSecret || !authConfigured) return res.status(401).json({ error: 'Please log in to continue.' })
  let claims: jwt.JwtPayload
  try { claims = jwt.verify(token, jwtSecret, { issuer: 'setmore-api', audience: 'setmore-web' }) as jwt.JwtPayload }
  catch { return res.status(401).json({ error: 'Your session has expired. Please log in again.' }) }
  if (typeof claims.sub !== 'string') return res.status(401).json({ error: 'Your session is invalid. Please log in again.' })
  try {
    if (demoAuthEnabled) {
      const user = (await readDemoUsers()).find(item => item.id === claims.sub)
      if (!user) { res.clearCookie(sessionCookie, { httpOnly: true, secure: cookieSecure, sameSite: cookieSameSite, path: '/' }); return res.status(401).json({ error: 'Please log in to continue.' }) }
      req.user = { id: user.id, role: user.role }
      req.demoUser = user
      return next()
    }
    const user = await prisma.user.findUnique({ where: { id: claims.sub }, select: { id: true, role: true } })
    if (!user) { res.clearCookie(sessionCookie, { httpOnly: true, secure: cookieSecure, sameSite: cookieSameSite, path: '/' }); return res.status(401).json({ error: 'Please log in to continue.' }) }
    req.user = user
    return next()
  } catch (error) { return next(error) }
}

function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== UserRole.ADMIN) return res.status(403).json({ error: 'Administrator access required.' })
  return next()
}

const asyncRoute = (handler: (req: AuthRequest, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => Promise.resolve(handler(req as AuthRequest, res)).catch(next)
const registerSchema = z.object({ name: z.string().trim().min(2, 'Enter at least 2 characters.').max(100), email: z.string().trim().email('Enter a valid email address.').max(254), password: z.string().min(10, 'Use at least 10 characters.').max(100) })
const loginSchema = z.object({ email: z.string().trim().email('Enter a valid email address.'), password: z.string().min(1, 'Enter your password.') })
const eventSchema = z.object({ title:z.string().trim().min(3).max(150), description:z.string().trim().min(10), category:z.string().trim().min(2), venue:z.string().trim().min(2), city:z.string().trim().min(2), latitude:z.number().min(-90).max(90), longitude:z.number().min(-180).max(180), startsAt:z.string().datetime(), price:z.number().int().nonnegative(), capacity:z.number().int().positive(), imageUrl:z.string().url().optional(), isOutdoor:z.boolean().default(false), published:z.boolean().default(false) })
const publicUser = { id: true, name: true, email: true, role: true, createdAt: true }

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  if (!authConfigured) return res.status(503).json({ error: 'Authentication is not configured on the server.' })
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Please check your details.', fields: parsed.error.flatten().fieldErrors })
  const { name, password } = parsed.data
  const email = parsed.data.email.toLowerCase()
  try {
    if (demoAuthEnabled) {
      const users = await readDemoUsers()
      if (users.some(user => user.email === email)) return res.status(409).json({ error: 'An account with this email already exists.' })
      const user: DemoUser = { id: randomUUID(), name, email, passwordHash: await bcrypt.hash(password, 12), role: email === demoAdminEmail ? UserRole.ADMIN : UserRole.CUSTOMER, createdAt: new Date().toISOString() }
      users.push(user)
      await writeDemoUsers(users)
      res.cookie(sessionCookie, signSession(user), cookieOptions)
      return res.status(201).json({ user: toPublicDemoUser(user) })
    }
    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({ data: { name, email, passwordHash }, select: publicUser })
    res.cookie(sessionCookie, signSession(user), cookieOptions)
    return res.status(201).json({ user })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return res.status(409).json({ error: 'An account with this email already exists.' })
    throw error
  }
}))

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  if (!authConfigured) return res.status(503).json({ error: 'Authentication is not configured on the server.' })
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Please check your details.', fields: parsed.error.flatten().fieldErrors })
  if (demoAuthEnabled) {
    const user = (await readDemoUsers()).find(item => item.email === parsed.data.email.toLowerCase())
    if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return res.status(401).json({ error: 'Email or password is incorrect.' })
    res.cookie(sessionCookie, signSession(user), cookieOptions)
    return res.json({ user: toPublicDemoUser(user) })
  }
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } })
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return res.status(401).json({ error: 'Email or password is incorrect.' })
  res.cookie(sessionCookie, signSession(user), cookieOptions)
  return res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt } })
}))

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie(sessionCookie, { httpOnly: true, secure: cookieSecure, sameSite: cookieSameSite, path: '/' })
  return res.status(204).end()
})

app.get('/api/auth/me', authenticate, asyncRoute(async (req, res) => {
  if (req.demoUser) return res.json({ user: toPublicDemoUser(req.demoUser) })
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: publicUser })
  if (!user) { res.clearCookie(sessionCookie, cookieOptions); return res.status(401).json({ error: 'Please log in to continue.' }) }
  return res.json({ user })
}))

app.patch('/api/users/me', authenticate, asyncRoute(async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(100), email: z.string().trim().email().max(254) }).partial().refine(value => Object.keys(value).length > 0).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Enter a valid name or email address.' })
  if (req.demoUser) {
    const users = await readDemoUsers()
    const user = users.find(item => item.id === req.demoUser!.id)!
    const email = parsed.data.email?.toLowerCase()
    if (email && users.some(item => item.id !== user.id && item.email === email)) return res.status(409).json({ error: 'That email is already in use.' })
    if (parsed.data.name) user.name = parsed.data.name
    if (email) user.email = email
    await writeDemoUsers(users)
    req.demoUser = user
    return res.json({ user: toPublicDemoUser(user) })
  }
  try {
    const user = await prisma.user.update({ where: { id: req.user!.id }, data: { ...parsed.data, ...(parsed.data.email ? { email: parsed.data.email.toLowerCase() } : {}) }, select: publicUser })
    return res.json({ user })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return res.status(409).json({ error: 'That email is already in use.' })
    throw error
  }
}))

app.get('/api/events', asyncRoute(async (_req, res) => res.json(await prisma.event.findMany({ where: { published: true, startsAt: { gte: new Date() } }, orderBy: { startsAt: 'asc' } }))))
app.get('/api/events/:id', asyncRoute(async (req, res) => {
  const parsedId = z.string().min(1).safeParse(req.params.id)
  if (!parsedId.success) return res.status(400).json({ error: 'Invalid event id.' })
  const event = await prisma.event.findFirst({ where: { id: parsedId.data, published: true } })
  return event ? res.json(event) : res.status(404).json({ error: 'Event not found.' })
}))

app.get('/api/admin/events', authenticate, requireAdmin, asyncRoute(async (_req, res) => res.json(await prisma.event.findMany({ orderBy: { startsAt: 'asc' } }))))
app.post('/api/admin/events', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  const parsed = eventSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Please check the event details.', fields: parsed.error.flatten().fieldErrors })
  return res.status(201).json(await prisma.event.create({ data: { ...parsed.data, startsAt: new Date(parsed.data.startsAt) } }))
}))
app.patch('/api/admin/events/:id', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  const parsedId = z.string().min(1).safeParse(req.params.id)
  if (!parsedId.success) return res.status(400).json({ error: 'Invalid event id.' })
  const parsed = eventSchema.partial().safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Please check the event details.', fields: parsed.error.flatten().fieldErrors })
  const data = { ...parsed.data, ...(parsed.data.startsAt ? { startsAt: new Date(parsed.data.startsAt) } : {}) }
  return res.json(await prisma.event.update({ where: { id: parsedId.data }, data }))
}))
app.delete('/api/admin/events/:id', authenticate, requireAdmin, asyncRoute(async (req, res) => {
  const parsedId = z.string().min(1).safeParse(req.params.id)
  if (!parsedId.success) return res.status(400).json({ error: 'Invalid event id.' })
  await prisma.event.delete({ where: { id: parsedId.data } })
  return res.status(204).end()
}))

app.post('/api/bookings', authenticate, asyncRoute(async (req, res) => {
  const parsed = z.object({ eventId: z.string().min(1), quantity: z.number().int().min(1).max(8) }).safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Choose a valid ticket quantity.' })
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Event" WHERE "id" = ${parsed.data.eventId} FOR UPDATE`
    const event = await tx.event.findFirst({ where: { id: parsed.data.eventId, published: true, startsAt: { gt: new Date() } } })
    if (!event) throw Object.assign(new Error('This event is unavailable.'), { status: 404 })
    const booked = await tx.booking.aggregate({ where: { eventId: event.id, status: 'CONFIRMED' }, _sum: { quantity: true } })
    const available = event.capacity - (booked._sum.quantity ?? 0)
    if (parsed.data.quantity > available) throw Object.assign(new Error(`Only ${available} tickets remain.`), { status: 409 })
    return tx.booking.create({ data: { userId: req.user!.id, eventId: event.id, quantity: parsed.data.quantity }, include: { event: true, payment: true } })
  })
  return res.status(201).json(result)
}))
app.get('/api/bookings/me', authenticate, asyncRoute(async (req, res) => res.json(await prisma.booking.findMany({ where: { userId: req.user!.id }, include: { event: true, payment: true }, orderBy: { createdAt: 'desc' } }))))
app.post('/api/bookings/:id/cancel', authenticate, asyncRoute(async (req, res) => {
  const parsedId = z.string().min(1).safeParse(req.params.id)
  if (!parsedId.success) return res.status(400).json({ error: 'Invalid booking id.' })
  const booking = await prisma.booking.findFirst({ where: { id: parsedId.data, userId: req.user!.id, status: 'CONFIRMED' }, include: { payment: true } })
  if (!booking) return res.status(404).json({ error: 'Active booking not found.' })
  if (booking.payment?.status === 'SUCCEEDED') return res.status(409).json({ error: 'This paid booking needs a payment provider refund workflow.' })
  return res.json(await prisma.booking.update({ where: { id: booking.id }, data: { status: 'CANCELLED' } }))
}))

app.get('/api/admin/bookings', authenticate, requireAdmin, asyncRoute(async (_req, res) => res.json(await prisma.booking.findMany({ include: { user: { select: { id: true, name: true, email: true } }, event: true, payment: true }, orderBy: { createdAt: 'desc' } }))))
app.get('/api/admin/customers', authenticate, requireAdmin, asyncRoute(async (_req, res) => res.json(await prisma.user.findMany({ where: { role: UserRole.CUSTOMER }, select: { id: true, name: true, email: true, createdAt: true, _count: { select: { bookings: true } } }, orderBy: { createdAt: 'desc' } }))))

app.use((error: HttpError, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error)
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return res.status(404).json({ error: 'The requested record was not found.' })
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') return res.status(409).json({ error: 'This record is in use and cannot be removed.' })
  return res.status(error.status || 500).json({ error: error.status ? error.message : 'Something went wrong. Please try again.' })
})

app.listen(port, () => console.log(`SETMORE API listening on port ${port}`))
