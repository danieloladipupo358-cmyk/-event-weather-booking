import { createContext } from 'react'
import type { AuthValue } from './AuthContext'

export const AuthContext = createContext<AuthValue | null>(null)
