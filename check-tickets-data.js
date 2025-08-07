// check-tickets-data.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function checkTicketsData() {
  console.log('🔍 Checking tickets data...');
  
  try {
    // Get the tickets data
    const { data: tickets, error } = await supabase
      .from('documents')
      .select('*')
      .eq('title', 'Tickets Data')
      .single();
    
    if (error) throw error;
    
    console.log('📄 Tickets content preview:');
    console.log(tickets.content.substring(0, 500));
    
    // Count Saw Andrew mentions
    const sawAndrewCount = (tickets.content.match(/Saw Andrew/g) || []).length;
    console.log(`\n📊 "Saw Andrew" appears ${sawAndrewCount} times`);
    
    // Show some lines with Saw Andrew
    const lines = tickets.content.split('\n');
    const sawAndrewLines = lines.filter(line => line.includes('Saw Andrew')).slice(0, 3);
    
    console.log('\n📝 Sample lines with Saw Andrew:');
    sawAndrewLines.forEach((line, i) => {
      console.log(`${i+1}. ${line.substring(0, 100)}...`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkTicketsData();