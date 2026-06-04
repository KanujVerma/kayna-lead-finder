# Kayna Lead Finder Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private Next.js web app that finds local business leads via Google Places, scores their websites with PageSpeed Insights, and tracks outreach via a 7-stage Kanban CRM.

**Architecture:** Next.js 15 App Router with route groups `(auth)` and `(app)` for clean sidebar/no-sidebar layout separation. All external API calls are proxied server-side. PageSpeed scores stream back via a POST-based SSE route (fetch + ReadableStream) processed in parallel batches of 5 to stay within Vercel's 30s timeout. Supabase Postgres stores CRM leads with an upsert on `(name, city)`. iron-session v3 manages the password gate via middleware.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS 4, Supabase JS v2, @dnd-kit/core + @dnd-kit/sortable, iron-session v3, Google Places API (New — `places.googleapis.com/v1`), Google PageSpeed Insights API v5

---

## File Map

```
kayna-lead-finder/
├── app/
│   ├── layout.tsx                      # Root layout: html/body + globals.css only
│   ├── globals.css                     # CSS variables (color tokens) + Tailwind import
│   ├── (auth)/
│   │   └── login/
│   │       └── page.tsx                # Password gate UI — no sidebar
│   ├── page.tsx                        # redirect() to /finder (replaces create-next-app default)
│   └── (app)/
│       ├── layout.tsx                  # Sidebar + <main> wrapper
│       ├── finder/
│       │   └── page.tsx                # Thin server shell — renders FinderShell
│       ├── pipeline/
│       │   └── page.tsx                # Fetches leads server-side → KanbanBoard
│       └── stats/
│           └── page.tsx                # "Coming soon" static placeholder
├── app/api/
│   ├── auth/
│   │   ├── login/route.ts              # POST: validate password, set iron-session cookie
│   │   └── logout/route.ts             # POST: destroy cookie
│   ├── search/route.ts                 # GET ?category=&city= → Google Places results
│   ├── score/route.ts                  # POST [{id,url}] → SSE stream of PageSpeed scores
│   └── leads/route.ts                  # GET / POST (upsert) / PATCH ?id=
├── components/
│   ├── Sidebar.tsx                     # Fixed 210px left nav with Next Link
│   ├── finder/
│   │   ├── FinderShell.tsx             # 'use client'; orchestrates search + SSE state
│   │   ├── SearchForm.tsx              # Category + city inputs, search button
│   │   ├── ResultsTable.tsx            # Table wrapper: renders LeadRow per business
│   │   ├── LeadRow.tsx                 # Row: checkbox, data cells, score pill, action
│   │   └── BulkActions.tsx             # Count indicator, Select All, Add to CRM, Export CSV
│   └── pipeline/
│       ├── KanbanBoard.tsx             # 'use client'; DndContext + 7 columns
│       ├── KanbanColumn.tsx            # useDroppable drop target for one stage
│       └── LeadCard.tsx                # useDraggable card with inline notes
├── lib/
│   ├── supabase.ts                     # Server-side Supabase client (service role key)
│   ├── session.ts                      # iron-session SessionOptions + SessionData type
│   ├── places.ts                       # searchPlaces() + parsePlacesResponse() (testable)
│   └── pagespeed.ts                    # fetchPageSpeed() + extractScore() (testable)
├── types/
│   └── index.ts                        # Business, Lead, Stage, ScoreEvent types
├── middleware.ts                       # Protect all routes except /login + /api/auth/*
├── public/
│   └── arrows.svg                      # Logo SVG icon
├── .env.local.example                  # Env var template (committed; .env.local is not)
├── supabase/
│   └── migrations/
│       └── 001_create_leads.sql        # leads table DDL
└── __tests__/
    ├── lib/places.test.ts
    ├── lib/pagespeed.test.ts
    └── lib/session.test.ts
```

---

## Chunk 1: Project Setup + Auth

### Task 0: Initialize Project + Install Dependencies

**Files:**
- Creates all scaffold files (Next.js boilerplate)
- Create: `.env.local.example`
- Create: `public/arrows.svg`
- Create: `jest.config.ts`

- [ ] **Step 1: Initialize Next.js in the existing directory**

```bash
cd /Users/kanuj/kayna-lead-finder
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --app \
  --no-src-dir \
  --import-alias "@/*" \
  --no-eslint \
  --yes
```

If prompted about overwriting files in an existing directory, confirm. The `docs/` folder will be preserved.

- [ ] **Step 2: Install app dependencies**

```bash
npm install @supabase/supabase-js iron-session @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

- [ ] **Step 3: Install test dependencies**

```bash
npm install -D jest jest-environment-node @testing-library/jest-dom ts-jest @types/jest
```

- [ ] **Step 4: Configure Jest**

Create `jest.config.ts`:
```typescript
import type { Config } from 'jest'

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
}

export default config
```

Add to `package.json` scripts section:
```json
"test": "jest",
"test:watch": "jest --watch"
```

- [ ] **Step 5: Create env var template**

Create `.env.local.example`:
```
SITE_PASSWORD=your-shared-password
SESSION_SECRET=at-least-32-characters-random-string-here!!
GOOGLE_PLACES_API_KEY=your-places-api-key
PAGESPEED_API_KEY=your-pagespeed-api-key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Copy to `.env.local` and fill in real values (this file is gitignored by default).

- [ ] **Step 6: Create the SVG logo**

Create `public/arrows.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#5ce1e6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="12" y1="5" x2="12" y2="19"/>
  <polyline points="5 12 12 5 19 12"/>
  <line x1="5" y1="19" x2="19" y2="19"/>
</svg>
```

- [ ] **Step 7: Commit scaffold**

```bash
git add -A
git commit -m "feat: scaffold kayna-lead-finder Next.js app"
```

---

### Task 1: Types + Session Config

**Files:**
- Create: `types/index.ts`
- Create: `lib/session.ts`
- Create: `__tests__/lib/session.test.ts`

- [ ] **Step 1: Create shared types**

Create `types/index.ts`:
```typescript
export type Stage =
  | 'new'
  | 'called'
  | 'follow_up'
  | 'meeting'
  | 'proposal'
  | 'won'
  | 'lost'

export interface Business {
  id: string           // Google Places place_id
  name: string
  category: string
  city: string
  phone: string
  website: string | null
  rating: number | null
  reviewCount: number | null
  score: number | null | 'loading' | 'error'
}

export interface Lead {
  id: string           // uuid from Supabase
  name: string
  category: string | null
  city: string | null
  phone: string | null
  website: string | null
  score: number | null
  stage: Stage
  notes: string | null
  deal_value: number | null
  added_at: string
  updated_at: string
}

export interface ScoreEvent {
  id: string           // place_id
  score: number | null
  error?: string
}
```

- [ ] **Step 2: Write the session test**

Create `__tests__/lib/session.test.ts`:
```typescript
// Set required env var before importing — iron-session reads it at module load time
process.env.SESSION_SECRET = 'test-secret-at-least-32-characters-long!!'
process.env.NODE_ENV = 'test'

import { sessionOptions } from '@/lib/session'

test('sessionOptions has required fields', () => {
  expect(sessionOptions.cookieName).toBe('kayna_session')
  expect(typeof sessionOptions.password).toBe('string')
  expect((sessionOptions.password as string).length).toBeGreaterThan(0)
  expect(sessionOptions.ttl).toBe(60 * 60 * 24 * 7)
  expect(sessionOptions.cookieOptions?.httpOnly).toBe(true)
})
```

- [ ] **Step 3: Run test — expect FAIL**

```bash
npx jest __tests__/lib/session.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/session'`

- [ ] **Step 4: Implement session config**

Create `lib/session.ts`:
```typescript
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
```

- [ ] **Step 5: Run test — expect PASS**

```bash
npx jest __tests__/lib/session.test.ts
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add types/index.ts lib/session.ts __tests__/lib/session.test.ts
git commit -m "feat: add shared types and iron-session config"
```

---

### Task 2: Auth — Middleware + Login Page + Auth API Routes

**Files:**
- Create: `middleware.ts`
- Create: `app/(auth)/login/page.tsx`
- Create: `app/api/auth/login/route.ts`
- Create: `app/api/auth/logout/route.ts`

- [ ] **Step 1: Create auth middleware**

Create `middleware.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { sessionOptions, SessionData } from '@/lib/session'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow login page and auth API routes through
  if (pathname === '/login' || pathname.startsWith('/api/auth/')) {
    return NextResponse.next()
  }

  // In middleware, pass request + response objects (not cookies() — that's Route Handler only)
  const response = NextResponse.next()
  const session = await getIronSession<SessionData>(request, response, sessionOptions)

  if (!session.isLoggedIn) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|arrows.svg).*)'],
}
```

- [ ] **Step 2: Create login API route**

Create `app/api/auth/login/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { sessionOptions, SessionData } from '@/lib/session'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  const { password } = await request.json()

  if (password !== process.env.SITE_PASSWORD) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  session.isLoggedIn = true
  await session.save()

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Create logout API route**

Create `app/api/auth/logout/route.ts`:
```typescript
import { NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { sessionOptions, SessionData } from '@/lib/session'
import { cookies } from 'next/headers'

export async function POST() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  session.destroy()
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Create login page**

Create `app/(auth)/login/page.tsx`:
```tsx
'use client'
import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })

    if (res.ok) {
      router.push('/finder')
    } else {
      setError('Incorrect password')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0a0a0a' }}>
      <div className="border rounded-xl p-10 w-full max-w-sm" style={{ background: '#111', borderColor: '#1f1f1f' }}>
        <div className="flex items-center gap-3 mb-8">
          <Image src="/arrows.svg" alt="Kayna" width={28} height={28} />
          <div>
            <div className="font-bold text-lg leading-none" style={{ color: '#e2e8f0' }}>kayna</div>
            <div className="text-xs" style={{ color: '#64748b' }}>lead finder</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm mb-1" style={{ color: '#64748b' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-lg px-4 py-3 focus:outline-none"
              style={{
                background: '#0a0a0a',
                border: '1px solid #1f1f1f',
                color: '#e2e8f0',
              }}
              placeholder="Enter password"
              autoFocus
            />
          </div>

          {error && <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full font-semibold rounded-lg py-3 transition-colors disabled:opacity-50"
            style={{ background: '#5ce1e6', color: '#0a0a0a' }}
          >
            {loading ? 'Logging in…' : 'Enter'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Manually test auth**

```bash
npm run dev
```

- Visit `http://localhost:3000` — should redirect to `/login`
- Enter wrong password — "Incorrect password" error
- Set `SITE_PASSWORD` in `.env.local`, restart dev server
- Enter correct password — should redirect to `/finder` (404 for now is fine)

- [ ] **Step 6: Commit**

```bash
git add middleware.ts app/\(auth\)/ app/api/auth/
git commit -m "feat: add password auth middleware and login page"
```

---

## Chunk 2: Database + API Routes

### Task 3: Supabase Schema + Client

**Files:**
- Create: `supabase/migrations/001_create_leads.sql`
- Create: `lib/supabase.ts`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/001_create_leads.sql`:
```sql
create extension if not exists "uuid-ossp";

create table if not exists leads (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  category    text,
  city        text,
  phone       text,
  website     text,
  score       integer,
  stage       text not null default 'new'
                check (stage in ('new', 'called', 'follow_up', 'meeting', 'proposal', 'won', 'lost')),
  notes       text,
  deal_value  integer,
  added_at    timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (name, city)
);

-- Auto-update updated_at on row change
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger leads_updated_at
  before update on leads
  for each row execute function update_updated_at_column();
```

- [ ] **Step 2: Run the migration in Supabase**

Option A — Supabase Dashboard: Go to SQL Editor → paste the migration → Run.
Option B — Supabase CLI:
```bash
npx supabase db push
```

- [ ] **Step 3: Create Supabase server client**

Create `lib/supabase.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'

// Server-side only — uses service role key (bypasses RLS)
export function getSupabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add supabase/ lib/supabase.ts
git commit -m "feat: add Supabase schema and server client"
```

---

### Task 4: Google Places API Route

**Files:**
- Create: `lib/places.ts`
- Create: `app/api/search/route.ts`
- Create: `__tests__/lib/places.test.ts`

- [ ] **Step 1: Write the test**

Create `__tests__/lib/places.test.ts`:
```typescript
import { parsePlacesResponse } from '@/lib/places'

const mockApiResponse = {
  places: [
    {
      id: 'ChIJ_abc123',
      displayName: { text: 'Test Restaurant' },
      primaryTypeDisplayName: { text: 'Restaurant' },
      nationalPhoneNumber: '+1 555-123-4567',
      websiteUri: 'https://testrestaurant.com',
      rating: 4.2,
      userRatingCount: 87,
    },
    {
      id: 'ChIJ_xyz789',
      displayName: { text: 'No Website Cafe' },
      primaryTypeDisplayName: { text: 'Cafe' },
      nationalPhoneNumber: '+1 555-987-6543',
      // no websiteUri
      rating: 3.8,
      userRatingCount: 23,
    },
  ],
}

test('maps fields correctly for business with website', () => {
  const results = parsePlacesResponse(mockApiResponse, 'Seattle')
  expect(results[0]).toMatchObject({
    id: 'ChIJ_abc123',
    name: 'Test Restaurant',
    category: 'Restaurant',
    city: 'Seattle',
    phone: '+1 555-123-4567',
    website: 'https://testrestaurant.com',
    rating: 4.2,
    reviewCount: 87,
    score: 'loading',  // has website → score starts as loading
  })
})

test('sets website to null and score to null for business without website', () => {
  const results = parsePlacesResponse(mockApiResponse, 'Seattle')
  expect(results[1].website).toBeNull()
  expect(results[1].score).toBeNull()  // no website → no scoring
})

test('returns empty array for empty response', () => {
  expect(parsePlacesResponse({ places: [] }, 'Seattle')).toHaveLength(0)
  expect(parsePlacesResponse({}, 'Seattle')).toHaveLength(0)
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx jest __tests__/lib/places.test.ts
```
Expected: FAIL — `Cannot find module '@/lib/places'`

- [ ] **Step 3: Implement the places lib**

Create `lib/places.ts`:
```typescript
import type { Business } from '@/types'

// Exported for testing
export function parsePlacesResponse(
  data: Record<string, unknown>,
  city: string
): Business[] {
  const places = (data.places as Record<string, unknown>[]) ?? []
  return places.map((place) => {
    const website = (place.websiteUri as string | undefined) ?? null
    return {
      id: place.id as string,
      name: (place.displayName as { text: string }).text,
      category:
        (place.primaryTypeDisplayName as { text: string } | undefined)?.text ?? '',
      city,
      phone: (place.nationalPhoneNumber as string | undefined) ?? '',
      website,
      rating: (place.rating as number | undefined) ?? null,
      reviewCount: (place.userRatingCount as number | undefined) ?? null,
      score: website ? 'loading' : null,
    }
  })
}

export async function searchPlaces(
  category: string,
  city: string
): Promise<Business[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY!

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': [
        'places.id',
        'places.displayName',
        'places.primaryTypeDisplayName',
        'places.nationalPhoneNumber',
        'places.websiteUri',
        'places.rating',
        'places.userRatingCount',
      ].join(','),
    },
    body: JSON.stringify({ textQuery: `${category} in ${city}`, pageSize: 20 }),
  })

  if (!res.ok) {
    throw new Error(`Places API error: ${res.status} ${res.statusText}`)
  }

  return parsePlacesResponse(await res.json(), city)
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx jest __tests__/lib/places.test.ts
```
Expected: PASS

- [ ] **Step 5: Create the search API route**

Create `app/api/search/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { searchPlaces } from '@/lib/places'

export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get('category') ?? ''
  const city = request.nextUrl.searchParams.get('city') ?? ''

  if (!category || !city) {
    return NextResponse.json(
      { error: 'category and city are required' },
      { status: 400 }
    )
  }

  try {
    const businesses = await searchPlaces(category, city)
    return NextResponse.json({ businesses })
  } catch (err) {
    console.error('[/api/search]', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/places.ts app/api/search/ __tests__/lib/places.test.ts
git commit -m "feat: add Google Places API route with parsePlacesResponse"
```

---

### Task 5: PageSpeed SSE Route

**Files:**
- Create: `lib/pagespeed.ts`
- Create: `app/api/score/route.ts`
- Create: `__tests__/lib/pagespeed.test.ts`

- [ ] **Step 1: Write the test**

Create `__tests__/lib/pagespeed.test.ts`:
```typescript
import { extractScore } from '@/lib/pagespeed'

test('extracts mobile performance score and converts to 0-100', () => {
  const mockResponse = {
    lighthouseResult: {
      categories: {
        performance: { score: 0.73 },
      },
    },
  }
  expect(extractScore(mockResponse)).toBe(73)
})

test('rounds fractional scores', () => {
  const mockResponse = {
    lighthouseResult: { categories: { performance: { score: 0.556 } } },
  }
  expect(extractScore(mockResponse)).toBe(56)
})

test('returns null for missing or malformed data', () => {
  expect(extractScore({})).toBeNull()
  expect(extractScore({ lighthouseResult: {} })).toBeNull()
  expect(extractScore({ lighthouseResult: { categories: {} } })).toBeNull()
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx jest __tests__/lib/pagespeed.test.ts
```
Expected: FAIL

- [ ] **Step 3: Implement pagespeed lib**

Create `lib/pagespeed.ts`:
```typescript
// Exported for testing
export function extractScore(data: Record<string, unknown>): number | null {
  try {
    const lr = data.lighthouseResult as Record<string, unknown> | undefined
    const cats = lr?.categories as Record<string, unknown> | undefined
    const perf = cats?.performance as { score: number } | undefined
    if (perf?.score == null) return null
    return Math.round(perf.score * 100)
  } catch {
    return null
  }
}

export async function fetchPageSpeed(url: string): Promise<number | null> {
  const apiKey = process.env.PAGESPEED_API_KEY!
  const endpoint =
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed` +
    `?url=${encodeURIComponent(url)}&strategy=mobile&key=${apiKey}`

  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(25_000) })
    if (!res.ok) return null
    return extractScore(await res.json())
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx jest __tests__/lib/pagespeed.test.ts
```
Expected: PASS

- [ ] **Step 5: Create SSE API route**

Create `app/api/score/route.ts`:
```typescript
import { NextRequest } from 'next/server'
import { fetchPageSpeed } from '@/lib/pagespeed'

// POST body: [{ id: string, url: string }]
// Streams SSE events: data: {"id":"...","score":73}\n\n
// On error/timeout per URL: score is null
// Final event: event: done\ndata: {}\n\n
export async function POST(request: NextRequest) {
  const businesses: { id: string; url: string }[] = await request.json()
  const encoder = new TextEncoder()
  const BATCH_SIZE = 5

  const stream = new ReadableStream({
    async start(controller) {
      for (let i = 0; i < businesses.length; i += BATCH_SIZE) {
        const batch = businesses.slice(i, i + BATCH_SIZE)

        await Promise.all(
          batch.map(async ({ id, url }) => {
            const score = await fetchPageSpeed(url)
            const event = `data: ${JSON.stringify({ id, score })}\n\n`
            controller.enqueue(encoder.encode(event))
          })
        )
      }

      controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'))
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
```

- [ ] **Step 6: Commit**

```bash
git add lib/pagespeed.ts app/api/score/ __tests__/lib/pagespeed.test.ts
git commit -m "feat: add PageSpeed SSE scoring route"
```

---

### Task 6: Leads CRUD API Route

**Files:**
- Create: `app/api/leads/route.ts`

- [ ] **Step 1: Create the leads route**

Create `app/api/leads/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase'
import type { Stage } from '@/types'

// GET /api/leads — all leads ordered by added_at desc
export async function GET() {
  const supabase = getSupabaseServer()
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('added_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leads: data })
}

// POST /api/leads — upsert one or many leads (by name+city unique constraint)
export async function POST(request: NextRequest) {
  const body = await request.json()
  const leads = Array.isArray(body) ? body : [body]
  const supabase = getSupabaseServer()

  const { data, error } = await supabase
    .from('leads')
    .upsert(leads, { onConflict: 'name,city', ignoreDuplicates: false })
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leads: data }, { status: 201 })
}

// PATCH /api/leads?id=<uuid> — update stage, notes, or deal_value
export async function PATCH(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const updates: { stage?: Stage; notes?: string; deal_value?: number } =
    await request.json()
  const supabase = getSupabaseServer()

  const { data, error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lead: data })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/leads/
git commit -m "feat: add leads CRUD API (GET, POST upsert, PATCH)"
```

---

## Chunk 3: UI — Layout, Finder, Pipeline

### Task 7: Global Layout + Sidebar + Shell Pages

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Create: `app/(app)/layout.tsx`
- Create: `app/(app)/page.tsx`
- Create: `app/(app)/stats/page.tsx`
- Create: `components/Sidebar.tsx`

- [ ] **Step 1: Set up global CSS**

Replace the contents of `app/globals.css`:
```css
@import "tailwindcss";

:root {
  --bg: #0a0a0a;
  --sidebar: #111111;
  --card: #111111;
  --border: #1f1f1f;
  --accent: #5ce1e6;
  --text: #e2e8f0;
  --muted: #64748b;
}

* { box-sizing: border-box; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: system-ui, -apple-system, sans-serif;
  margin: 0;
}
```

- [ ] **Step 2: Update root layout to be minimal**

Replace `app/layout.tsx`:
```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kayna Lead Finder',
  description: 'Find and track local business leads',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: Create the Sidebar component**

Create `components/Sidebar.tsx`:
```tsx
'use client'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'

const nav = [
  { href: '/finder', label: 'Lead Finder' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/stats', label: 'Stats' },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      className="fixed left-0 top-0 h-full flex flex-col"
      style={{ width: 210, background: 'var(--sidebar)', borderRight: '1px solid var(--border)' }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-5 py-6"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <Image src="/arrows.svg" alt="Kayna" width={24} height={24} />
        <div>
          <div className="font-bold text-sm leading-none" style={{ color: 'var(--text)' }}>
            kayna
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
            lead finder
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ href, label }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className="block px-3 py-2 rounded-lg text-sm transition-colors"
              style={{
                color: active ? 'var(--accent)' : 'var(--muted)',
                background: active ? 'rgba(92, 225, 230, 0.08)' : 'transparent',
              }}
            >
              {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
```

- [ ] **Step 4: Create the (app) route group layout**

Create `app/(app)/layout.tsx`:
```tsx
import Sidebar from '@/components/Sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <Sidebar />
      <main style={{ marginLeft: 210, minHeight: '100vh', padding: '2rem' }}>
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 5: Replace root page with redirect**

`create-next-app` generates `app/page.tsx` with the default Next.js welcome page. Replace it:

Replace `app/page.tsx` (overwrite the generated file):
```tsx
import { redirect } from 'next/navigation'
export default function Home() {
  redirect('/finder')
}
```

**Do not** create `app/(app)/page.tsx` — that would conflict with `app/page.tsx` for the `/` route.

- [ ] **Step 6: Create stats placeholder**

Create `app/(app)/stats/page.tsx`:
```tsx
export default function StatsPage() {
  return (
    <div className="flex items-center justify-center" style={{ height: '60vh' }}>
      <div className="text-center">
        <div className="text-4xl mb-4">📊</div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text)' }}>
          Stats
        </h1>
        <p style={{ color: 'var(--muted)' }}>
          Coming soon — deal insights, conversion rates, and revenue tracking.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Verify navigation works**

```bash
npm run dev
```
- Visit `http://localhost:3000` → redirects to `/login` → after login → `/finder` (404 for now)
- `/stats` → shows "Coming soon"
- Sidebar shows: Lead Finder, Pipeline, Stats
- Active nav item has teal highlight

- [ ] **Step 8: Commit**

```bash
git add app/globals.css app/layout.tsx app/\(app\)/ components/Sidebar.tsx
git commit -m "feat: add layout, sidebar, route groups, stats placeholder"
```

---

### Task 8: Lead Finder Page

**Files:**
- Create: `app/(app)/finder/page.tsx`
- Create: `components/finder/FinderShell.tsx`
- Create: `components/finder/SearchForm.tsx`
- Create: `components/finder/ResultsTable.tsx`
- Create: `components/finder/LeadRow.tsx`
- Create: `components/finder/BulkActions.tsx`

State flow:
1. `FinderShell` owns: `businesses[]`, `selected Set<string>`, `searchLoading` flag
2. User submits `SearchForm` → `FinderShell` calls `GET /api/search` → sets businesses
3. After search, `FinderShell` POSTs to `/api/score` → reads response body as a stream
4. Each `data:` SSE line updates that business's score in state
5. `BulkActions` "Add to CRM" → POST selected businesses to `/api/leads`

- [ ] **Step 1: Create finder server page**

Create `app/(app)/finder/page.tsx`:
```tsx
import FinderShell from '@/components/finder/FinderShell'

export default function FinderPage() {
  return <FinderShell />
}
```

- [ ] **Step 2: Create SearchForm**

Create `components/finder/SearchForm.tsx`:
```tsx
'use client'
import { useState, FormEvent } from 'react'

interface Props {
  onSearch: (category: string, city: string) => void
  loading: boolean
}

export default function SearchForm({ onSearch, loading }: Props) {
  const [category, setCategory] = useState('')
  const [city, setCity] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (category.trim() && city.trim()) onSearch(category.trim(), city.trim())
  }

  const inputStyle = {
    background: '#0a0a0a',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    borderRadius: 8,
    padding: '10px 16px',
    width: 220,
    outline: 'none',
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-3 flex-wrap">
      <input
        type="text"
        placeholder="Business category"
        value={category}
        onChange={e => setCategory(e.target.value)}
        style={inputStyle}
        onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
        onBlur={e => (e.target.style.borderColor = 'var(--border)')}
      />
      <input
        type="text"
        placeholder="City"
        value={city}
        onChange={e => setCity(e.target.value)}
        style={inputStyle}
        onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
        onBlur={e => (e.target.style.borderColor = 'var(--border)')}
      />
      <button
        type="submit"
        disabled={loading || !category || !city}
        className="font-semibold px-6 py-2.5 rounded-lg transition-colors disabled:opacity-50"
        style={{ background: 'var(--accent)', color: '#0a0a0a', borderRadius: 8 }}
      >
        {loading ? 'Searching…' : 'Search'}
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Create BulkActions**

Create `components/finder/BulkActions.tsx`:
```tsx
'use client'
import type { Business } from '@/types'

interface Props {
  businesses: Business[]
  selected: Set<string>
  onSelectAll: () => void
  onClearAll: () => void
  onAddToCRM: () => void
  onExportCSV: () => void
}

export default function BulkActions({
  businesses, selected, onSelectAll, onClearAll, onAddToCRM, onExportCSV,
}: Props) {
  const count = selected.size
  const total = businesses.length
  const allSelected = count === total && total > 0

  return (
    <div className="flex items-center gap-4 py-2">
      <span className="text-sm" style={{ color: 'var(--muted)' }}>
        {count} of {total} selected
      </span>
      <button
        onClick={allSelected ? onClearAll : onSelectAll}
        className="text-sm hover:underline"
        style={{ color: 'var(--accent)' }}
      >
        {allSelected ? 'Deselect All' : 'Select All'}
      </button>

      <div className="flex-1" />

      <button
        onClick={onExportCSV}
        disabled={total === 0}
        className="text-sm px-4 py-1.5 rounded-lg transition-colors disabled:opacity-40"
        style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}
      >
        Export CSV
      </button>
      <button
        onClick={onAddToCRM}
        disabled={count === 0}
        className="text-sm font-semibold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        style={{ background: 'var(--accent)', color: '#0a0a0a', borderRadius: 8 }}
      >
        Add {count > 0 ? `${count} ` : ''}to CRM
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Create LeadRow**

Create `components/finder/LeadRow.tsx`:
```tsx
'use client'
import type { Business } from '@/types'

function ScorePill({ score, website }: { score: Business['score']; website: string | null }) {
  if (website === null) {
    return (
      <span
        className="text-xs font-bold px-2 py-0.5 rounded-full"
        style={{ background: 'rgba(92,225,230,0.12)', color: '#5ce1e6' }}
      >
        🔥 Hot
      </span>
    )
  }
  if (score === 'loading') {
    return <span className="text-xs animate-pulse" style={{ color: 'var(--muted)' }}>Scoring…</span>
  }
  if (score === 'error' || score === null) {
    return <span className="text-xs" style={{ color: '#f87171' }}>Error</span>
  }
  const num = score as number
  const color = num < 50 ? '#f87171' : num < 75 ? '#fbbf24' : '#4ade80'
  return (
    <span
      className="text-xs font-bold px-2 py-0.5 rounded-full"
      style={{ background: `${color}20`, color }}
    >
      {num}
    </span>
  )
}

interface Props {
  business: Business
  checked: boolean
  onToggle: () => void
  onAddToCRM: () => void
}

export default function LeadRow({ business, checked, onToggle, onAddToCRM }: Props) {
  const { name, category, phone, rating, website, score } = business

  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td className="py-3 pl-4 pr-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          style={{ accentColor: 'var(--accent)' }}
        />
      </td>
      <td className="py-3 px-3">
        <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{name}</div>
        <div className="text-xs" style={{ color: 'var(--muted)' }}>{category}</div>
      </td>
      <td className="py-3 px-3 text-sm" style={{ color: 'var(--text)' }}>
        {phone || '—'}
      </td>
      <td className="py-3 px-3 text-sm" style={{ color: 'var(--muted)' }}>
        {rating != null ? `★ ${rating}` : '—'}
      </td>
      <td className="py-3 px-3 text-sm" style={{ maxWidth: 200 }}>
        {website ? (
          <a
            href={website}
            target="_blank"
            rel="noopener noreferrer"
            className="underline truncate block"
            style={{ color: 'var(--accent)', maxWidth: 180 }}
          >
            {website.replace(/^https?:\/\//, '')}
          </a>
        ) : (
          <span style={{ color: 'var(--muted)' }}>—</span>
        )}
      </td>
      <td className="py-3 px-3">
        <ScorePill score={score} website={website} />
      </td>
      <td className="py-3 px-3 pr-4">
        <button
          onClick={onAddToCRM}
          className="text-xs px-3 py-1 rounded-lg transition-colors"
          style={{ border: '1px solid var(--accent)', color: 'var(--accent)' }}
        >
          Add to CRM
        </button>
      </td>
    </tr>
  )
}
```

- [ ] **Step 5: Create ResultsTable**

Create `components/finder/ResultsTable.tsx`:
```tsx
'use client'
import type { Business } from '@/types'
import LeadRow from './LeadRow'

const HEADERS = ['', 'Business', 'Phone', 'Rating', 'Website', 'Score', '']

interface Props {
  businesses: Business[]
  selected: Set<string>
  onToggle: (id: string) => void
  onAddOne: (business: Business) => void
}

export default function ResultsTable({ businesses, selected, onToggle, onAddOne }: Props) {
  if (businesses.length === 0) return null

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{ border: '1px solid var(--border)' }}
    >
      <table className="w-full">
        <thead>
          <tr style={{ background: '#0d0d0d' }}>
            {HEADERS.map((h, i) => (
              <th
                key={i}
                className="py-2.5 px-3 text-left text-xs font-medium first:pl-4 last:pr-4"
                style={{ color: 'var(--muted)' }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {businesses.map(b => (
            <LeadRow
              key={b.id}
              business={b}
              checked={selected.has(b.id)}
              onToggle={() => onToggle(b.id)}
              onAddToCRM={() => onAddOne(b)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 6: Create FinderShell (main client orchestrator)**

Create `components/finder/FinderShell.tsx`:
```tsx
'use client'
import { useState, useCallback } from 'react'
import type { Business } from '@/types'
import SearchForm from './SearchForm'
import ResultsTable from './ResultsTable'
import BulkActions from './BulkActions'

export default function FinderShell() {
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [searchLoading, setSearchLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSearch = useCallback(async (category: string, city: string) => {
    setSearchLoading(true)
    setError(null)
    setSelected(new Set())

    try {
      const res = await fetch(
        `/api/search?category=${encodeURIComponent(category)}&city=${encodeURIComponent(city)}`
      )
      if (!res.ok) throw new Error('Search failed')

      const { businesses: results } = await res.json()
      setBusinesses(results)
      setSearchLoading(false)

      // Start streaming PageSpeed scores for businesses that have websites
      const toScore = results.filter((b: Business) => b.website)
      if (toScore.length === 0) return

      const scoreRes = await fetch('/api/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toScore.map((b: Business) => ({ id: b.id, url: b.website! }))),
      })

      if (!scoreRes.body) return

      const reader = scoreRes.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.id) {
              setBusinesses(prev =>
                prev.map(b =>
                  b.id === event.id
                    ? { ...b, score: event.score != null ? event.score : 'error' }
                    : b
                )
              )
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    } catch {
      setError('Search failed. Please try again.')
      setSearchLoading(false)
    }
  }, [])

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const addToCRM = async (items: Business[]) => {
    const payload = items.map(b => ({
      name: b.name,
      category: b.category,
      city: b.city,
      phone: b.phone,
      website: b.website,
      score: typeof b.score === 'number' ? b.score : null,
      stage: 'new',
    }))
    await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }

  const handleExportCSV = () => {
    const headers = ['Name', 'Category', 'City', 'Phone', 'Website', 'Score', 'Rating']
    const rows = businesses.map(b => [
      b.name, b.category, b.city, b.phone,
      b.website ?? '',
      typeof b.score === 'number' ? b.score : '',
      b.rating ?? '',
    ])
    const csv = [headers, ...rows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leads-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-6" style={{ color: 'var(--text)' }}>
        Lead Finder
      </h1>

      <SearchForm onSearch={handleSearch} loading={searchLoading} />

      {error && (
        <p className="text-sm mt-4" style={{ color: '#f87171' }}>{error}</p>
      )}

      {businesses.length > 0 && (
        <div className="mt-6 space-y-2">
          <BulkActions
            businesses={businesses}
            selected={selected}
            onSelectAll={() => setSelected(new Set(businesses.map(b => b.id)))}
            onClearAll={() => setSelected(new Set())}
            onAddToCRM={() => addToCRM(businesses.filter(b => selected.has(b.id)))}
            onExportCSV={handleExportCSV}
          />
          <ResultsTable
            businesses={businesses}
            selected={selected}
            onToggle={toggleSelect}
            onAddOne={b => addToCRM([b])}
          />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Test the finder flow**

```bash
npm run dev
```
- Search "restaurants" in "Seattle"
- Results appear immediately; scores fill in progressively
- Select some rows → "Add to CRM" → check Supabase `leads` table
- "Export CSV" → downloads a CSV file
- Businesses with no website show "🔥 Hot" badge instead of a score

- [ ] **Step 8: Commit**

```bash
git add app/\(app\)/finder/ components/finder/
git commit -m "feat: add Lead Finder page with SSE progressive scoring"
```

---

### Task 9: CRM Pipeline (Kanban)

**Files:**
- Create: `app/(app)/pipeline/page.tsx`
- Create: `components/pipeline/KanbanBoard.tsx`
- Create: `components/pipeline/KanbanColumn.tsx`
- Create: `components/pipeline/LeadCard.tsx`

- [ ] **Step 1: Create pipeline server page**

Create `app/(app)/pipeline/page.tsx`:
```tsx
import KanbanBoard from '@/components/pipeline/KanbanBoard'
import { getSupabaseServer } from '@/lib/supabase'
import type { Lead } from '@/types'

// Query Supabase directly — avoids internal HTTP call that would hit the auth middleware
async function getLeads(): Promise<Lead[]> {
  const supabase = getSupabaseServer()
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .order('added_at', { ascending: false })
  if (error) {
    console.error('[pipeline] Failed to fetch leads:', error.message)
    return []
  }
  return data ?? []
}

export default async function PipelinePage() {
  const leads = await getLeads()
  const activeCount = leads.filter(l => l.stage !== 'won' && l.stage !== 'lost').length

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Pipeline</h1>
        <span className="text-sm" style={{ color: 'var(--muted)' }}>
          {activeCount} active lead{activeCount !== 1 ? 's' : ''}
        </span>
      </div>
      <KanbanBoard initialLeads={leads} />
    </div>
  )
}
```

- [ ] **Step 2: Create LeadCard**

Create `components/pipeline/LeadCard.tsx`:
```tsx
'use client'
import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import type { Lead, Stage } from '@/types'

const STAGE_ORDER: Stage[] = ['new', 'called', 'follow_up', 'meeting', 'proposal', 'won', 'lost']
const NEXT_STAGE_LABEL: Record<Stage, string> = {
  new: 'Called', called: 'Follow Up', follow_up: 'Meeting Set',
  meeting: 'Proposal Sent', proposal: 'Closed Won', won: 'Closed Lost', lost: 'Closed Lost',
}

function ScorePill({ score }: { score: number | null }) {
  if (score === null) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full"
        style={{ background: 'rgba(92,225,230,0.12)', color: '#5ce1e6' }}>
        🔥 No site
      </span>
    )
  }
  const color = score < 50 ? '#f87171' : score < 75 ? '#fbbf24' : '#4ade80'
  return (
    <span className="text-xs font-bold px-2 py-0.5 rounded-full"
      style={{ background: `${color}20`, color }}>
      {score}
    </span>
  )
}

interface Props {
  lead: Lead
  onStageChange: (id: string, stage: Stage) => void
  onNotesChange: (id: string, notes: string) => void
}

export default function LeadCard({ lead, onStageChange, onNotesChange }: Props) {
  const [showNotes, setShowNotes] = useState(false)
  const [notes, setNotes] = useState(lead.notes ?? '')

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    data: { stage: lead.stage },
  })

  const stageIdx = STAGE_ORDER.indexOf(lead.stage as Stage)
  const nextStage = stageIdx < STAGE_ORDER.length - 1 ? STAGE_ORDER[stageIdx + 1] : null

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, opacity: 0.85, zIndex: 999 }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 12,
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
      }}
      {...listeners}
      {...attributes}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>
          {lead.name}
        </span>
        <ScorePill score={lead.score} />
      </div>

      {lead.phone && (
        <div className="text-xs mb-2" style={{ color: 'var(--muted)' }}>{lead.phone}</div>
      )}

      {/* Quick move button */}
      {nextStage && (
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onStageChange(lead.id, nextStage) }}
          className="w-full text-left text-xs transition-colors mb-1"
          style={{ color: 'var(--muted)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}
        >
          Move → {NEXT_STAGE_LABEL[nextStage]}
        </button>
      )}

      {/* Notes toggle */}
      <button
        onPointerDown={e => e.stopPropagation()}
        onClick={e => { e.stopPropagation(); setShowNotes(!showNotes) }}
        className="text-xs"
        style={{ color: 'var(--muted)' }}
      >
        {showNotes ? 'Hide notes ▲' : 'Notes ▼'}
      </button>

      {showNotes && (
        <textarea
          onPointerDown={e => e.stopPropagation()}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          onBlur={() => onNotesChange(lead.id, notes)}
          placeholder="Add notes…"
          rows={3}
          className="w-full mt-2 text-xs resize-none focus:outline-none"
          style={{
            background: '#1a1a1a',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--text)',
            padding: 8,
          }}
          onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
          onBlur={e => {
            e.target.style.borderColor = 'var(--border)'
            onNotesChange(lead.id, notes)
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create KanbanColumn**

Create `components/pipeline/KanbanColumn.tsx`:
```tsx
'use client'
import { useDroppable } from '@dnd-kit/core'
import type { Lead, Stage } from '@/types'
import LeadCard from './LeadCard'

interface Props {
  stage: Stage
  label: string
  color: string
  leads: Lead[]
  onStageChange: (id: string, stage: Stage) => void
  onNotesChange: (id: string, notes: string) => void
}

export default function KanbanColumn({
  stage, label, color, leads, onStageChange, onNotesChange,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: stage })

  return (
    <div
      ref={setNodeRef}
      className="flex-shrink-0 rounded-xl transition-colors"
      style={{
        width: 240,
        border: `1px solid ${isOver ? 'var(--accent)' : 'var(--border)'}`,
        background: 'var(--sidebar)',
      }}
    >
      {/* Column header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="w-2 h-2 rounded-full" style={{ background: color }} />
        <span className="text-sm font-medium" style={{ color }}>{label}</span>
        <span
          className="ml-auto text-xs rounded-full px-2"
          style={{ background: '#1a1a1a', color: 'var(--muted)' }}
        >
          {leads.length}
        </span>
      </div>

      {/* Cards */}
      <div className="p-2 space-y-2" style={{ minHeight: 200 }}>
        {leads.map(lead => (
          <LeadCard
            key={lead.id}
            lead={lead}
            onStageChange={onStageChange}
            onNotesChange={onNotesChange}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create KanbanBoard**

Create `components/pipeline/KanbanBoard.tsx`:
```tsx
'use client'
import { useState } from 'react'
import {
  DndContext, DragEndEvent,
  MouseSensor, TouchSensor,
  useSensor, useSensors,
} from '@dnd-kit/core'
import type { Lead, Stage } from '@/types'
import KanbanColumn from './KanbanColumn'

const STAGES: { stage: Stage; label: string; color: string }[] = [
  { stage: 'new',       label: 'New Lead',      color: '#64748b' },
  { stage: 'called',    label: 'Called',         color: '#60a5fa' },
  { stage: 'follow_up', label: 'Follow Up',      color: '#a78bfa' },
  { stage: 'meeting',   label: 'Meeting Set',    color: '#34d399' },
  { stage: 'proposal',  label: 'Proposal Sent',  color: '#fbbf24' },
  { stage: 'won',       label: 'Closed Won',     color: '#4ade80' },
  { stage: 'lost',      label: 'Closed Lost',    color: '#f87171' },
]

interface Props {
  initialLeads: Lead[]
}

export default function KanbanBoard({ initialLeads }: Props) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  )

  const updateStage = async (id: string, stage: Stage) => {
    // Optimistic update
    setLeads(prev => prev.map(l => l.id === id ? { ...l, stage } : l))
    await fetch(`/api/leads?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage }),
    })
  }

  const updateNotes = async (id: string, notes: string) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, notes } : l))
    await fetch(`/api/leads?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    })
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return
    const newStage = over.id as Stage
    const lead = leads.find(l => l.id === active.id)
    if (lead && lead.stage !== newStage) {
      updateStage(String(active.id), newStage)
    }
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map(({ stage, label, color }) => (
          <KanbanColumn
            key={stage}
            stage={stage}
            label={label}
            color={color}
            leads={leads.filter(l => l.stage === stage)}
            onStageChange={updateStage}
            onNotesChange={updateNotes}
          />
        ))}
      </div>
    </DndContext>
  )
}
```

- [ ] **Step 5: Test the pipeline**

```bash
npm run dev
```
- Visit `/pipeline` — 7 Kanban columns render
- Add a lead via Finder, then reload `/pipeline` — card appears in "New Lead"
- Drag a card to another column — verify DB updated (check Supabase)
- Click "Move →" button — card moves to next stage
- Click "Notes ▼" — textarea appears; type notes, click away — DB updated

- [ ] **Step 6: Commit**

```bash
git add app/\(app\)/pipeline/ components/pipeline/
git commit -m "feat: add CRM Pipeline with 7-stage Kanban and drag-and-drop"
```

---

## Chunk 4: Tests, Build Check, Deploy

### Task 10: Run Full Test Suite + Build Verification

- [ ] **Step 1: Run all tests**

```bash
npx jest --coverage
```
Expected: 3 test files pass (session, places, pagespeed). Coverage report generated.

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```
Fix any type errors before proceeding.

- [ ] **Step 3: Production build**

```bash
npm run build
```
Expected: Build succeeds with no errors.

Common issues to fix:
- Components using browser APIs without `'use client'` → add the directive
- `cookies()` needs to be awaited in Next.js 15 — ensure all usages use `await cookies()`
- `Image` component needs `next/image` and a configured domain if loading external images

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve TypeScript and build errors"
```

---

### Task 11: Deploy to Vercel

- [ ] **Step 1: Add env vars in Vercel dashboard**

Go to Vercel → Project → Settings → Environment Variables. Add all 7 vars from `.env.local.example`:
```
SITE_PASSWORD
SESSION_SECRET          (≥32 characters, random)
GOOGLE_PLACES_API_KEY
PAGESPEED_API_KEY
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

- [ ] **Step 2: Deploy**

```bash
vercel --prod
```

- [ ] **Step 3: Smoke test deployed app**

- Login with `SITE_PASSWORD` → redirects to Finder
- Search "dentists" in "Austin" → results appear, scores load
- Add a lead to CRM → visit Pipeline → card appears
- Drag card between columns → stage persists on reload
- Visit Stats → "Coming soon" placeholder

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: post-deploy cleanup"
```

---

## Summary

| Chunk | Tasks | What it delivers |
|-------|-------|-----------------|
| 1 | 0–2 | Running auth gate — login page + middleware |
| 2 | 3–6 | All API routes — database, search, scoring, leads CRUD |
| 3 | 7–9 | Complete UI — layout, finder with SSE scoring, Kanban CRM |
| 4 | 10–11 | Verified build + deployed to Vercel |

Each chunk is independently deployable. After Chunk 1, you have a secured skeleton. After Chunk 2, you have a working backend. After Chunk 3, you have a complete app. Chunk 4 ships it.
