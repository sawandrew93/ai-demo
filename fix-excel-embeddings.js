// fix-excel-embeddings.js
require('dotenv').config();
const EmbeddingService = require('./knowledge-base/embeddings');
const KnowledgeBaseDB = require('./knowledge-base/database');

async function fixExcelEmbeddings() {
  console.log('🔧 Starting Excel embeddings fix...');
  
  const embeddingService = new EmbeddingService();
  const knowledgeDB = new KnowledgeBaseDB();
  
  try {
    // Get all documents without embeddings (likely Excel files)
    const { data: documentsWithoutEmbeddings, error } = await knowledgeDB.supabase
      .from('documents')
      .select('*')
      .or('embedding.is.null,embedding.eq.{}')
      .eq('source_type', 'xlsx');
    
    if (error) {
      throw error;
    }
    
    console.log(`📊 Found ${documentsWithoutEmbeddings.length} Excel documents without embeddings`);
    
    if (documentsWithoutEmbeddings.length === 0) {
      console.log('✅ All Excel documents already have embeddings!');
      return;
    }
    
    let fixedCount = 0;
    
    for (const doc of documentsWithoutEmbeddings) {
      try {
        console.log(`🔄 Processing document: ${doc.title} (ID: ${doc.id})`);
        console.log(`📄 Content preview: ${doc.content.substring(0, 100)}...`);
        
        // Generate embedding for the content
        const embedding = await embeddingService.generateEmbedding(doc.content);
        
        // Update the document with the new embedding
        const { error: updateError } = await knowledgeDB.supabase
          .from('documents')
          .update({ embedding: embedding })
          .eq('id', doc.id);
        
        if (updateError) {
          console.error(`❌ Failed to update document ${doc.id}:`, updateError);
          continue;
        }
        
        console.log(`✅ Fixed embedding for document: ${doc.title}`);
        fixedCount++;
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Error processing document ${doc.id}:`, error);
      }
    }
    
    console.log(`\n🎉 Fix complete!`);
    console.log(`✅ Fixed embeddings for ${fixedCount} documents`);
    console.log(`❌ Failed to fix ${documentsWithoutEmbeddings.length - fixedCount} documents`);
    
    // Test the search after fixing
    console.log('\n🔍 Testing search with Excel data...');
    const testQuery = 'How many tickets are assigned to Saw Andrew?';
    const queryEmbedding = await embeddingService.generateEmbedding(testQuery);
    const searchResults = await knowledgeDB.searchSimilarDocuments(queryEmbedding, 0.1, 5);
    
    console.log(`📊 Search test results: ${searchResults.length} documents found`);
    searchResults.forEach((result, index) => {
      console.log(`  ${index + 1}. Title: "${result.title}", Similarity: ${result.similarity.toFixed(3)}`);
      console.log(`     Content: ${result.content.substring(0, 100)}...`);
    });
    
  } catch (error) {
    console.error('❌ Fix failed:', error);
  }
}

// Run the fix
if (require.main === module) {
  fixExcelEmbeddings().then(() => {
    console.log('🏁 Script completed');
    process.exit(0);
  }).catch(error => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });
}

module.exports = { fixExcelEmbeddings };