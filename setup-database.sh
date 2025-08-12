#!/bin/bash

# Database setup script
# Usage: ./setup-database.sh

set -e

echo "🗄️ Setting up database tables..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please create it first."
    exit 1
fi

# Load environment variables
source .env

# Check required variables
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_KEY" ]; then
    echo "❌ SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env file"
    exit 1
fi

echo "📊 Creating database tables..."

# Run the database setup
node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function setupDatabase() {
  try {
    console.log('📋 Reading SQL setup file...');
    const sql = fs.readFileSync('setup-users-table.sql', 'utf8');
    
    console.log('🔧 Executing database setup...');
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      console.error('❌ Database setup failed:', error);
      process.exit(1);
    }
    
    console.log('✅ Database setup completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

setupDatabase();
"

echo "✅ Database setup complete!"