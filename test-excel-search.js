// test-excel-search.js
require('dotenv').config();
const EmbeddingService = require('./knowledge-base/embeddings');
const KnowledgeBaseDB = require('./knowledge-base/database');

async function testExcelSearch() {
  console.log('🧪 Testing Excel file search functionality...');
  
  const embeddingService = new EmbeddingService();
  const knowledgeDB = new KnowledgeBaseDB();
  
  try {
    // First, check what documents exist
    console.log('\n📊 Checking database contents...');
    const allDocs = await knowledgeDB.getAllDocuments(20);
    
    console.log(`Total documents: ${allDocs.length}`);
    
    const docsByType = {};
    allDocs.forEach(doc => {
      const type = doc.source_type || 'unknown';
      docsByType[type] = (docsByType[type] || 0) + 1;
    });
    
    console.log('Documents by type:');
    Object.entries(docsByType).forEach(([type, count]) => {
      console.log(`  - ${type}: ${count} documents`);
    });
    
    // Check embeddings status
    console.log('\n🔍 Checking embeddings status...');
    const docsWithEmbeddings = allDocs.filter(doc => doc.embedding && doc.embedding.length > 0);
    const docsWithoutEmbeddings = allDocs.filter(doc => !doc.embedding || doc.embedding.length === 0);
    
    console.log(`Documents with embeddings: ${docsWithEmbeddings.length}`);
    console.log(`Documents without embeddings: ${docsWithoutEmbeddings.length}`);
    
    if (docsWithoutEmbeddings.length > 0) {
      console.log('Documents missing embeddings:');
      docsWithoutEmbeddings.forEach(doc => {
        console.log(`  - ${doc.title} (${doc.source_type}) - ID: ${doc.id}`);
      });
    }
    
    // Test search queries
    const testQueries = [
      'How many tickets are assigned to Saw Andrew?',
      'tickets assigned to Saw Andrew',
      'Saw Andrew tickets',
      'employee handbook',
      'leave policy',
      'Myanmar'
    ];\n    
    console.log('\n🔍 Testing search queries...');
    
    for (const query of testQueries) {\n      console.log(`\\n--- Testing query: \"${query}\" ---`);\n      \n      try {\n        const queryEmbedding = await embeddingService.generateEmbedding(query);\n        const results = await knowledgeDB.searchSimilarDocuments(queryEmbedding, 0.1, 5);\n        \n        console.log(`Found ${results.length} results:`);\n        \n        results.forEach((result, index) => {\n          console.log(`  ${index + 1}. Title: \"${result.title}\" (${result.source_type || 'unknown'})`);\n          console.log(`     Similarity: ${result.similarity.toFixed(3)}`);\n          console.log(`     Content: ${result.content.substring(0, 150)}...`);\n        });\n        \n        if (results.length === 0) {\n          console.log('  ❌ No results found');\n        }\n        \n      } catch (error) {\n        console.error(`  ❌ Error searching for \"${query}\":`, error.message);\n      }\n    }\n    \n    // Summary\n    console.log('\\n📋 Summary:');\n    console.log(`- Total documents: ${allDocs.length}`);\n    console.log(`- Documents with embeddings: ${docsWithEmbeddings.length}`);\n    console.log(`- Documents without embeddings: ${docsWithoutEmbeddings.length}`);\n    \n    if (docsWithoutEmbeddings.length > 0) {\n      console.log('\\n⚠️  Some documents are missing embeddings. Run fix-excel-embeddings.js to fix this.');\n    } else {\n      console.log('\\n✅ All documents have embeddings!');\n    }\n    \n  } catch (error) {\n    console.error('❌ Test failed:', error);\n  }\n}\n\n// Run the test\nif (require.main === module) {\n  testExcelSearch().then(() => {\n    console.log('\\n🏁 Test completed');\n    process.exit(0);\n  }).catch(error => {\n    console.error('💥 Test failed:', error);\n    process.exit(1);\n  });\n}\n\nmodule.exports = { testExcelSearch };