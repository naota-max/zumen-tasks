import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://qybothwckwnjosulwyzm.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5Ym90aHdja3duam9zdWx3eXptIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MDI0MTYsImV4cCI6MjA4OTE3ODQxNn0.ebTEs1b_yeKDQJ2qkgEsYOFYY5tqpQSHjf4YHBKyuwE'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
