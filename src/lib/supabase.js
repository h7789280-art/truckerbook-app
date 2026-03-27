import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://zswsyxckaxidozvskgea.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpzd3N5eGNrYXhpZG96dnNrZ2VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1MzYxNjMsImV4cCI6MjA5MDExMjE2M30.7rw9BJ5dCx85tTjnXafwRS-gfVBI4UmVY5BYWxVr9aA'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
