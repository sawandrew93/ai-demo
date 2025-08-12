-- Create users table for agent authentication
CREATE TABLE IF NOT EXISTS agent_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(50) DEFAULT 'agent',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_agent_users_username ON agent_users(username);
CREATE INDEX IF NOT EXISTS idx_agent_users_email ON agent_users(email);

-- Initial users will be created automatically by the application
-- using environment variables for secure password management

-- Enable Row Level Security
ALTER TABLE agent_users ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated access
CREATE POLICY "Users can read own data" ON agent_users
    FOR SELECT USING (auth.uid()::text = id::text OR role = 'admin');