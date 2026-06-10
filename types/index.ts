export type Stage =
  | 'new'
  | 'called'
  | 'follow_up'
  | 'meeting'
  | 'proposal'
  | 'won'
  | 'lost'

// Outreach automation lifecycle (orthogonal to the human Kanban `Stage`).
// 22 approved values — kept in sync with the CHECK constraint in
// supabase/migrations/002_outreach_foundation.sql.
export type OutreachState =
  | 'new'
  | 'enriching'
  | 'enriched'
  | 'qualified'
  | 'needs_review'
  | 'approved_to_send'
  | 'scheduled'
  | 'sent_initial'
  | 'awaiting_response'
  | 'followup_1_scheduled'
  | 'followup_1_sent'
  | 'followup_2_scheduled'
  | 'followup_2_sent'
  | 'positive_reply'
  | 'meeting_requested'
  | 'manual_outreach'
  | 'manual_contacted'
  | 'not_interested'
  | 'unsubscribed'
  | 'bounced'
  | 'do_not_contact'
  | 'error'

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
  // Phase 2A outreach fields
  outreach_state: OutreachState
  mockup_ready: boolean
  best_email: string | null
  email_confidence: string | null
  resolved_at: string | null
  quality_score: number | null
  do_not_contact: boolean
}

export interface LeadEvidence {
  id: string
  lead_id: string
  source: string | null
  evidence_type: string | null
  value: string | null
  confidence: string | null
  blob_ref: string | null
  detail: Record<string, unknown> | null
  created_at: string
}

export interface LeadResolved {
  id: string
  lead_id: string
  best_email: string | null
  email_confidence: string | null
  context_pack: Record<string, unknown> | null
  resolved_at: string
  updated_at: string
}

export interface OutreachMessage {
  id: string
  lead_id: string
  template: string | null
  subject: string | null
  body: string | null
  direction: 'outbound' | 'inbound'
  status: 'scheduled' | 'sent' | 'failed' | 'bounced'
  scheduled_at: string | null
  sent_at: string | null
  gmail_message_id: string | null
  gmail_thread_id: string | null
  detail: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface Suppression {
  id: string
  email: string | null
  domain: string | null
  reason: 'unsubscribe' | 'bounce' | 'complaint' | 'manual'
  source: string | null
  lead_id: string | null
  created_at: string
}

export interface AuditLog {
  id: string
  lead_id: string | null
  event_type: string
  from_state: string | null
  to_state: string | null
  actor: string | null
  detail: Record<string, unknown> | null
  created_at: string
}

export interface GmailAccount {
  id: string
  email: string
  access_token_enc: string | null
  refresh_token_enc: string | null
  token_expiry: string | null
  scopes: string | null
  connected: boolean
  created_at: string
  updated_at: string
}

export interface Settings {
  id: 1
  auto_mode: boolean
  sending_paused: boolean
  physical_address: string | null
  unsubscribe_configured: boolean
  firecrawl_enabled: boolean
  warmup_start_date: string | null
  daily_cap: number
  business_hours_start: string
  business_hours_end: string
  allowed_cities: string[]
  allowed_categories: string[] | null
  created_at: string
  updated_at: string
}

export interface ScoreEvent {
  id: string           // place_id
  score: number | null
  error?: string
}
