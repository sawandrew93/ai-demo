// simple-excel-fix.js
require('dotenv').config();
const DocumentProcessor = require('./knowledge-base/document-processor');
const EmbeddingService = require('./knowledge-base/embeddings');
const KnowledgeBaseDB = require('./knowledge-base/database');

async function simpleExcelFix() {
  console.log('🔧 Simple Excel fix...');
  
  const processor = new DocumentProcessor();
  const embeddingService = new EmbeddingService();
  const knowledgeDB = new KnowledgeBaseDB();
  
  try {
    // Process the uploaded file directly
    const filePath = './temp/your-excel-file.xlsx'; // Update this
    
    // Simple approach - just get the text and embed it
    const result = await processor.processDocument(filePath, 'Tickets', 'xlsx');
    
    if (!result.chunks || result.chunks.length === 0) {
      console.log('❌ No chunks created. Let me try raw processing...');
      
      // Raw Excel processing
      const xlsx = require('xlsx');
      const workbook = xlsx.readFile(filePath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = xlsx.utils.sheet_to_csv(sheet);
      
      console.log('📄 Raw CSV data:', data.substring(0, 200));
      
      // Create one big chunk
      const embedding = await embeddingService.generateEmbedding(data);
      
      await knowledgeDB.supabase.from('documents').insert({
        title: 'Tickets Data',
        content: data,
        embedding: embedding,
        metadata: { source_type: 'xlsx', filename: 'tickets.xlsx' }
      });
      
      console.log('✅ Uploaded as single document');
    } else {
      console.log(`✅ Created ${result.chunks.length} chunks normally`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n💡 Try:');
    console.log('1. Put your Excel file in the ai-demo folder');
    console.log('2. Update the filePath in this script');
    console.log('3. Run: node simple-excel-fix.js');
  }
}

simpleExcelFix();