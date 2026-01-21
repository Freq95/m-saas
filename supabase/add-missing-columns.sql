-- Add missing columns to existing tables
-- Run this in Supabase SQL Editor after the initial schema

-- Add duration_minutes to services
ALTER TABLE services 
ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;

-- Make sent_at nullable in messages (if not already)
ALTER TABLE messages 
ALTER COLUMN sent_at DROP NOT NULL;

-- Add missing columns to appointments
ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS client_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS client_email VARCHAR(255),
ADD COLUMN IF NOT EXISTS client_phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add missing columns to tasks
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS contact_id INTEGER,
ADD COLUMN IF NOT EXISTS priority VARCHAR(50);

-- Add missing columns to contact_files
ALTER TABLE contact_files
ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255),
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Add missing columns to contact_notes (rename note to content if needed)
ALTER TABLE contact_notes
ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS content TEXT;

-- Update contact_notes: if note column exists, copy to content
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='contact_notes' AND column_name='note') THEN
    UPDATE contact_notes SET content = note WHERE content IS NULL;
    ALTER TABLE contact_notes DROP COLUMN IF EXISTS note;
  END IF;
END $$;

