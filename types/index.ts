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
  screenshot?: string | null
}

export interface Lead {
  id: string           // uuid from Supabase
  name: string
  category: string | null
  city: string | null
  phone: string | null
  website: string | null
  rating: number | null
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
