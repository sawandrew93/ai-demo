-- Complete database setup for VG AI Project
-- Run this in Supabase SQL Editor to create all required tables

-- Enable vector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Documents table for knowledge base
CREATE TABLE IF NOT EXISTS documents (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  embedding vector(768),
  source_type VARCHAR(50) DEFAULT 'manual',
  source_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Customer feedback table
CREATE TABLE IF NOT EXISTS customer_feedback (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,
  customer_name VARCHAR(255),
  customer_email VARCHAR(255),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  feedback_text TEXT,
  interaction_type VARCHAR(50) NOT NULL,
  agent_id VARCHAR(255),
  agent_name VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Customer intents table
CREATE TABLE IF NOT EXISTS customer_intents (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,
  customer_message TEXT NOT NULL,
  detected_intent VARCHAR(255),
  intent_category VARCHAR(100),
  confidence_score DECIMAL(3,2),
  matched_documents JSONB DEFAULT '[]',
  response_type VARCHAR(50) NOT NULL,
  customer_email VARCHAR(255),
  customer_company VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Customer attachments table
CREATE TABLE IF NOT EXISTS customer_attachments (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  file_size INTEGER NOT NULL,
  file_type VARCHAR(100) NOT NULL,
  file_url TEXT NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Vector similarity search function
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id bigint,
  title text,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    documents.id,
    documents.title,
    documents.content,
    documents.metadata,
    1 - (documents.embedding <=> query_embedding) AS similarity
  FROM documents
  WHERE 1 - (documents.embedding <=> query_embedding) > match_threshold
  ORDER BY documents.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS documents_embedding_idx ON documents USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS customer_feedback_session_idx ON customer_feedback(session_id);
CREATE INDEX IF NOT EXISTS customer_feedback_created_idx ON customer_feedback(created_at);
CREATE INDEX IF NOT EXISTS customer_intents_session_idx ON customer_intents(session_id);
CREATE INDEX IF NOT EXISTS customer_intents_created_idx ON customer_intents(created_at);
CREATE INDEX IF NOT EXISTS customer_intents_email_idx ON customer_intents(customer_email);
CREATE INDEX IF NOT EXISTS customer_intents_company_idx ON customer_intents(customer_company);
CREATE INDEX IF NOT EXISTS customer_attachments_session_idx ON customer_attachments(session_id);

-- Migration for existing databases: Update customer_intents table structure
-- This section handles updating existing tables to the new schema
DO $$ 
BEGIN
    -- Add customer_company column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'customer_intents' 
                   AND column_name = 'customer_company') THEN
        ALTER TABLE customer_intents ADD COLUMN customer_company VARCHAR(255);
        RAISE NOTICE 'Added customer_company column to customer_intents table';
    END IF;
    
    -- Ensure customer_email column exists (should already exist)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'customer_intents' 
                   AND column_name = 'customer_email') THEN
        ALTER TABLE customer_intents ADD COLUMN customer_email VARCHAR(255);
        RAISE NOTICE 'Added customer_email column to customer_intents table';
    END IF;
    
    -- Remove old unused columns if they exist (optional)
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'customer_intents' 
               AND column_name = 'customer_firstname') THEN
        -- You can uncomment the next line to remove the old column
        -- ALTER TABLE customer_intents DROP COLUMN customer_firstname;
        RAISE NOTICE 'customer_firstname column exists (not removed - uncomment to remove)';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'customer_intents' 
               AND column_name = 'customer_lastname') THEN
        -- You can uncomment the next line to remove the old column
        -- ALTER TABLE customer_intents DROP COLUMN customer_lastname;
        RAISE NOTICE 'customer_lastname column exists (not removed - uncomment to remove)';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'customer_intents' 
               AND column_name = 'customer_country') THEN
        -- You can uncomment the next line to remove the old column
        -- ALTER TABLE customer_intents DROP COLUMN customer_country;
        RAISE NOTICE 'customer_country column exists (not removed - uncomment to remove)';
    END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN customer_intents.customer_email IS 'Email address collected from customer at chat start';
COMMENT ON COLUMN customer_intents.customer_company IS 'Company name collected from customer at chat start';

-- Enable Row Level Security (optional - uncomment if needed)
-- ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE customer_feedback ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE customer_intents ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE customer_attachments ENABLE ROW LEVEL SECURITY;