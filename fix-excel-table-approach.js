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

    // 2. Process Excel file properly
    const excelPath = './Tickets.xlsx'; // Update this path
    
    try {
      const workbook = xlsx.readFile(excelPath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      
      // Convert to JSON with proper headers
      const jsonData = xlsx.utils.sheet_to_json(sheet);
      console.log(`📊 Found ${jsonData.length} rows in Excel`);
      
      // Process each row as a complete record
      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        const rowNumber = i + 2; // Excel row number (header is row 1)
        
        // Create comprehensive text for this ticket
        const ticketText = Object.entries(row)
          .filter(([key, value]) => value !== null && value !== undefined && value !== '')
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ');
        
        // Create searchable content with multiple formats
        const searchableContent = [
          `Ticket Row ${rowNumber}: ${ticketText}`,
          `Ticket ID ${row['Ticket IDs Sequence'] || 'unknown'}: ${ticketText}`,
          ticketText
        ].join('. ');
        
        // Generate embedding
        const embedding = await embeddingService.generateEmbedding(searchableContent);
        
        // Insert as individual ticket record
        const { error: insertError } = await supabase
          .from('documents')
          .insert({
            title: `Ticket ${row['Ticket IDs Sequence'] || rowNumber}`,
            content: searchableContent,
            embedding: embedding,
            metadata: {
              source_type: 'xlsx',
              row_number: rowNumber,
              ticket_id: row['Ticket IDs Sequence'],
              assigned_to: row['Assigned to'],
              customer: row['Customer'],
              ticket_data: row
            }
          });
        
        if (insertError) {
          console.error(`❌ Failed to insert row ${rowNumber}:`, insertError);
          continue;
        }
        
        console.log(`✅ Inserted Ticket ${row['Ticket IDs Sequence'] || rowNumber}`);
        
        // Delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      console.log('🎉 Excel processing completed!');
      
      // 3. Test the new approach
      console.log('\n🧪 Testing new approach...');
      await testQueries();
      
    } catch (fileError) {
      console.error('❌ Excel file not found. Please update the file path in the script.');
      console.log('Current path:', excelPath);
    }
    
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