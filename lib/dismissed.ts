import type { Business } from '@/types'

export const DISMISSED_KEY = 'kayna_dismissed_leads'

/** Case-insensitive composite key used for dedup across the app. */
export function makeKey(name: string, city: string): string {
  return `${name.toLowerCase()}|${city.toLowerCase()}`
}

export type DismissedEntry = Omit<Business, 'screenshot'>

export function readDismissed(): DismissedEntry[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function writeDismissed(entries: DismissedEntry[]): void {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(entries))
  } catch {}
}
