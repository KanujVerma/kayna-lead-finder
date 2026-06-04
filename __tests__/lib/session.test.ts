// Set required env var before importing — iron-session reads it at module load time
process.env.SESSION_SECRET = 'test-secret-at-least-32-characters-long!!'

import { sessionOptions } from '@/lib/session'

test('sessionOptions has required fields', () => {
  expect(sessionOptions.cookieName).toBe('kayna_session')
  expect(typeof sessionOptions.password).toBe('string')
  expect((sessionOptions.password as string).length).toBeGreaterThan(0)
  expect(sessionOptions.ttl).toBe(60 * 60 * 24 * 7)
  expect(sessionOptions.cookieOptions?.httpOnly).toBe(true)
})
