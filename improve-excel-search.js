// improve-excel-search.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const EmbeddingService = require('./knowledge-base/embeddings');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const embeddingService = new EmbeddingService();

async function improveExcelSearch() {
  console.log('🔧 Improving Excel search by re-processing chunks...');
  
  try {
    // Get all Excel documents
    const { data: excelDocs, error } = await supabase
      .from('documents')
      .select('*')
      .eq('source_type', 'xlsx');

    if (error) throw error;

    console.log(`📊 Found ${excelDocs.length} Excel documents to improve`);

    for (const doc of excelDocs) {
      try {
        // Create more searchable content by extracting key information
        let improvedContent = doc.content;
        
        // Add specific search terms for common queries
        if (doc.content.includes('Assigned to: Saw Andrew')) {
          improvedContent += '. Saw Andrew is assigned to this ticket. Saw Andrew has tickets assigned.';
        }
        
        if (doc.content.includes('Ticket IDs Sequence:')) {
          const ticketMatch = doc.content.match(/Ticket IDs Sequence: (\d+)/);
          if (ticketMatch) {
            improvedContent += `. Ticket number ${ticketMatch[1]}. Ticket ID ${ticketMatch[1]}.`;
          }
        }
        
        // Add customer name extraction
        const customerMatch = doc.content.match(/Customer Name: ([^,]+)/);
        if (customerMatch) {
          improvedContent += `. Customer is ${customerMatch[1]}.`;
        }

        // Re-generate embedding with improved content
        const newEmbedding = await embeddingService.generateEmbedding(improvedContent);
        
        // Update the document
        const { error: updateError } = await supabase
          .from('documents')
          .update({ 
            content: improvedContent,
            embedding: newEmbedding 
          })
          .eq('id', doc.id);

        if (updateError) {
          console.error(`❌ Failed to update document ${doc.id}:`, updateError);
          continue;
        }

        console.log(`✅ Improved document: ${doc.title}`);
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (docError) {
        console.error(`❌ Error processing document ${doc.id}:`, docError);
      }
    }

    console.log('🎉 Excel search improvement completed!');

  } catch (error) {
    console.error('❌ Improvement failed:', error);
  }
}

// Run the improvement
if (require.main === module) {
  improveExcelSearch().then(() => {
    console.log('🏁 Script completed');
    process.exit(0);
  }).catch(error => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });
}

module.exports = { improveExcelSearch };