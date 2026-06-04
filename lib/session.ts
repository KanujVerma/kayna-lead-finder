import type { SessionOptions } from 'iron-session'

export interface SessionData {
  isLoggedIn: boolean
}

export const sessionOptions: SessionOptions = {
  cookieName: 'kayna_session',
  password: process.env.SESSION_SECRET as string,
  ttl: 60 * 60 * 24 * 7, // 7 days in seconds
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
  },
}
