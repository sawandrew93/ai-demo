// fix-excel-table-approach.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');
const EmbeddingService = require('./knowledge-base/embeddings');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const embeddingService = new EmbeddingService();

async function fixExcelTableApproach() {
  console.log('🔧 Fixing Excel with proper table approach...');
  
  try {
    // 1. Remove all existing Excel documents
    console.log('🗑️ Removing old Excel documents...');
    const { error: deleteError } = await supabase
      .from('documents')
      .delete()
      .eq('source_type', 'xlsx');
    
    if (deleteError) throw deleteError;
    console.log('✅ Old Excel documents removed');

    // 2. Get existing Excel documents and reprocess them
    console.log('📄 Looking for existing Excel documents to reprocess...');
    
    const { data: existingExcel, error: fetchError } = await supabase
      .from('documents')
      .select('*')
      .eq('source_type', 'xlsx')
      .limit(1);
    
    if (fetchError) throw fetchError;
    
    if (existingExcel.length === 0) {
      console.log('❌ No Excel documents found in database.');
      console.log('📋 Please upload your Excel file through the web interface first:');
      console.log('   1. Go to /knowledge-base');
      console.log('   2. Login with agent credentials');
      console.log('   3. Upload your Excel file');
      console.log('   4. Then run this script');
      return;
    }
    
    console.log(`📊 Found Excel data to reprocess`);
    
    // Get the raw content and try to extract structured data
    const sampleDoc = existingExcel[0];
    console.log('📝 Sample content:', sampleDoc.content.substring(0, 200));
    
    // Parse the existing content to extract ticket information
    const content = sampleDoc.content;
    const ticketMatches = content.match(/Sheet\w*,?\s*Row\s*(\d+):[^.]+/g) || [];
    
    console.log(`🎯 Found ${ticketMatches.length} ticket records to reprocess`);
    
    for (let i = 0; i < ticketMatches.length; i++) {
      const ticketMatch = ticketMatches[i];
      
      // Extract ticket information from the text
      const ticketIdMatch = ticketMatch.match(/Ticket IDs Sequence:\s*(\d+)/);
      const assignedToMatch = ticketMatch.match(/Assigned to:\s*([^,]+)/);
      const customerMatch = ticketMatch.match(/Customer:\s*([^,]+)/);
      
      const ticketId = ticketIdMatch ? ticketIdMatch[1] : `unknown_${i}`;
      const assignedTo = assignedToMatch ? assignedToMatch[1].trim() : 'Unknown';
      const customer = customerMatch ? customerMatch[1].trim() : 'Unknown';
      
      // Create better searchable content
      const searchableContent = [
        `Ticket ${ticketId}: ${ticketMatch}`,
        `Assigned to ${assignedTo}, Ticket ID ${ticketId}`,
        `Customer ${customer}, Ticket ${ticketId}`,
        ticketMatch
      ].join('. ');
      
      // Generate embedding
      const embedding = await embeddingService.generateEmbedding(searchableContent);
      
      // Insert as individual ticket record
      const { error: insertError } = await supabase
        .from('documents')
        .insert({
          title: `Ticket ${ticketId}`,
          content: searchableContent,
          embedding: embedding,
          metadata: {
            source_type: 'xlsx',
            ticket_id: ticketId,
            assigned_to: assignedTo,
            customer: customer,
            original_content: ticketMatch
          }
        });
      
      if (insertError) {
        console.error(`❌ Failed to insert ticket ${ticketId}:`, insertError);
        continue;
      }
      
      console.log(`✅ Inserted Ticket ${ticketId} (Assigned: ${assignedTo})`);
      
      // Delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    console.log('🎉 Excel reprocessing completed!');
    
    // 3. Test the new approach
    console.log('\n🧪 Testing new approach...');
    await testQueries();
    
  } catch (error) {
    console.error('❌ Process failed:', error);
  }
}

async function testQueries() {
  const queries = [
    "How many tickets are assigned to Saw Andrew?",
    "Who is the customer of ticket 6797?",
    "What tickets are assigned to Saw Andrew?"
  ];
  
  for (const query of queries) {
    console.log(`\n🔍 Testing: "${query}"`);
    
    const queryEmbedding = await embeddingService.generateEmbedding(query);
    const { data: results, error } = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: 0.1,
      match_count: 5
    });
    
    if (error) {
      console.error('❌ Search error:', error);
      continue;
    }
    
    console.log(`📊 Found ${results.length} results`);
    results.forEach((result, i) => {
      console.log(`  ${i+1}. Similarity: ${result.similarity.toFixed(3)} - ${result.title}`);
      if (result.metadata?.ticket_data) {
        const ticket = result.metadata.ticket_data;
        console.log(`     Assigned to: ${ticket['Assigned to'] || 'N/A'}`);
        console.log(`     Customer: ${ticket['Customer'] || 'N/A'}`);
      }
    });
  }
}

// Run the fix
if (require.main === module) {
  fixExcelTableApproach().then(() => {
    console.log('\n🏁 Script completed');
    process.exit(0);
  }).catch(error => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });
}

module.exports = { fixExcelTableApproach };