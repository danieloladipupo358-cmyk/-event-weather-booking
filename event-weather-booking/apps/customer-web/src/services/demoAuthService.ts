import type { User } from './authService'

type LocalAccount = User & { salt: string; passwordHash: string }
const accountsKey = 'setmore-demo-accounts-v1'
const sessionKey = 'setmore-demo-session-v1'
const adminDemoEmail = 'admin@setmore.demo'
const iterations = 120_000

function readAccounts(): LocalAccount[] {
  try { return JSON.parse(localStorage.getItem(accountsKey) || '[]') as LocalAccount[] }
  catch { return [] }
}
function hex(bytes: Uint8Array) { return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('') }
function fromHex(value: string) { return Uint8Array.from(value.match(/.{1,2}/g) || [], byte => Number.parseInt(byte, 16)) }
async function passwordHash(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const saltCopy = new Uint8Array(salt.length)
  saltCopy.set(salt)
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltCopy.buffer, iterations }, key, 256)
  return hex(new Uint8Array(bits))
}
function publicAccount(account: LocalAccount): User {
  return { id:account.id,name:account.name,email:account.email,role:account.role,createdAt:account.createdAt }
}

export const demoAuthService = {
  hasSession() { return Boolean(sessionStorage.getItem(sessionKey)) },
  async currentUser() {
    const id = sessionStorage.getItem(sessionKey)
    if (!id) return null
    const account = readAccounts().find(user => user.id === id)
    if (!account) { sessionStorage.removeItem(sessionKey); return null }
    return publicAccount(account)
  },
  async register(input: { name: string; email: string; password: string }) {
    const email = input.email.trim().toLowerCase()
    const accounts = readAccounts()
    if (accounts.some(account => account.email === email)) throw new Error('An account with this email already exists.')
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const account: LocalAccount = {
      id: crypto.randomUUID(), name: input.name.trim(), email,
      role: email === adminDemoEmail ? 'ADMIN' : 'CUSTOMER',
      createdAt: new Date().toISOString(), salt: hex(salt), passwordHash: await passwordHash(input.password, salt),
    }
    accounts.push(account)
    localStorage.setItem(accountsKey, JSON.stringify(accounts))
    sessionStorage.setItem(sessionKey, account.id)
    return publicAccount(account)
  },
  async login(input: { email: string; password: string }) {
    const email = input.email.trim().toLowerCase()
    const account = readAccounts().find(user => user.email === email)
    if (!account || await passwordHash(input.password, fromHex(account.salt)) !== account.passwordHash) throw new Error('Email or password is incorrect.')
    sessionStorage.setItem(sessionKey, account.id)
    return publicAccount(account)
  },
  logout() { sessionStorage.removeItem(sessionKey) },
}
