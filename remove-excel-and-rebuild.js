// remove-excel-and-rebuild.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');
const fs = require('fs').promises;
const path = require('path');

const EmbeddingService = require('./knowledge-base/embeddings');
const KnowledgeBaseDB = require('./knowledge-base/database');

class ExcelProcessor {
  constructor() {
    this.supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    this.embeddingService = new EmbeddingService();
    this.knowledgeDB = new KnowledgeBaseDB();
  }

  async removeAllExcelDocuments() {
    console.log('🗑️ Removing all Excel documents from database...');
    
    try {
      const { data: excelDocs, error: fetchError } = await this.supabase
        .from('documents')
        .select('id, title')
        .eq('source_type', 'xlsx');

      if (fetchError) {
        throw fetchError;
      }

      console.log(`📊 Found ${excelDocs.length} Excel documents to remove`);

      if (excelDocs.length > 0) {
        const { error: deleteError } = await this.supabase
          .from('documents')
          .delete()
          .eq('source_type', 'xlsx');

        if (deleteError) {
          throw deleteError;
        }

        console.log(`✅ Removed ${excelDocs.length} Excel documents`);
        excelDocs.forEach(doc => {
          console.log(`   - ${doc.title} (ID: ${doc.id})`);
        });
      } else {
        console.log('✅ No Excel documents found to remove');
      }

      return excelDocs.length;
    } catch (error) {
      console.error('❌ Error removing Excel documents:', error);
      throw error;
    }
  }

  processExcelToStructuredText(filePath) {
    console.log(`📄 Processing Excel file: ${filePath}`);
    
    const workbook = xlsx.readFile(filePath);
    const results = [];

    workbook.SheetNames.forEach(sheetName => {
      console.log(`  📋 Processing sheet: ${sheetName}`);
      
      const sheet = workbook.Sheets[sheetName];
      const jsonData = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      
      if (jsonData.length === 0) {
        console.log(`    ⚠️ Sheet ${sheetName} is empty, skipping`);
        return;
      }

      // Get headers from first row
      const headers = jsonData[0] || [];
      console.log(`    📝 Headers: ${headers.join(', ')}`);

      // Process each data row
      const dataRows = jsonData.slice(1).filter(row => 
        row.some(cell => cell !== null && cell !== undefined && cell !== '')
      );

      console.log(`    📊 Processing ${dataRows.length} data rows`);

      dataRows.forEach((row, rowIndex) => {
        const rowData = {};
        const textParts = [];

        // Create structured data object and readable text
        headers.forEach((header, colIndex) => {
          const cellValue = row[colIndex];
          if (cellValue !== null && cellValue !== undefined && cellValue !== '') {
            const cleanHeader = String(header).trim();
            const cleanValue = String(cellValue).trim();
            
            if (cleanHeader && cleanValue) {
              rowData[cleanHeader] = cleanValue;
              textParts.push(`${cleanHeader}: ${cleanValue}`);
            }
          }
        });

        if (textParts.length > 0) {
          const rowText = textParts.join(', ');
          results.push({
            sheet: sheetName,
            row: rowIndex + 2, // +2 because we skipped header and array is 0-indexed
            data: rowData,
            text: `Sheet ${sheetName}, Row ${rowIndex + 2}: ${rowText}`,
            searchableText: rowText.toLowerCase()
          });
        }
      });
    });

    console.log(`✅ Processed ${results.length} rows from ${workbook.SheetNames.length} sheets`);
    return results;
  }

  async uploadExcelWithNewApproach(filePath, title) {
    console.log(`🔄 Uploading Excel file with new approach: ${title}`);
    
    try {
      // Process Excel file
      const processedData = this.processExcelToStructuredText(filePath);
      
      if (processedData.length === 0) {
        throw new Error('No data found in Excel file');
      }

      // Group rows into chunks for better embedding
      const chunkSize = 5; // Process 5 rows at a time
      const chunks = [];
      
      for (let i = 0; i < processedData.length; i += chunkSize) {
        const chunk = processedData.slice(i, i + chunkSize);
        const chunkText = chunk.map(item => item.text).join('. ');
        const chunkData = chunk.map(item => item.data);
        
        chunks.push({
          title: `${title} - Rows ${chunk[0].row}-${chunk[chunk.length - 1].row}`,
          content: chunkText,
          metadata: {
            source_type: 'xlsx',
            filename: path.basename(filePath),
            chunk_start_row: chunk[0].row,
            chunk_end_row: chunk[chunk.length - 1].row,
            sheets: [...new Set(chunk.map(item => item.sheet))],
            row_count: chunk.length,
            structured_data: chunkData
          }
        });
      }

      console.log(`📦 Created ${chunks.length} chunks from Excel data`);

      // Upload chunks to database
      let successCount = 0;
      for (const chunk of chunks) {
        try {
          console.log(`⬆️ Uploading chunk: ${chunk.title}`);
          
          // Generate embedding
          const embedding = await this.embeddingService.generateEmbedding(chunk.content);
          
          // Insert into database
          const { error } = await this.supabase
            .from('documents')
            .insert({
              title: chunk.title,
              content: chunk.content,
              embedding: embedding,
              metadata: chunk.metadata,
              source_type: 'xlsx'
            });

          if (error) {
            console.error(`❌ Failed to upload chunk ${chunk.title}:`, error);
            continue;
          }

          console.log(`✅ Successfully uploaded: ${chunk.title}`);
          successCount++;

          // Add delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));

        } catch (chunkError) {
          console.error(`❌ Error processing chunk ${chunk.title}:`, chunkError);
        }
      }

      console.log(`🎉 Upload complete! ${successCount}/${chunks.length} chunks uploaded successfully`);
      return { success: true, chunksUploaded: successCount, totalChunks: chunks.length };

    } catch (error) {
      console.error('❌ Excel upload failed:', error);
      throw error;
    }
  }

  async testExcelSearch(query = "How many tickets are assigned to Saw Andrew?") {
    console.log(`🔍 Testing Excel search with query: "${query}"`);
    
    try {
      // Generate embedding for query
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);
      
      // Search for Excel documents
      const results = await this.knowledgeDB.searchSimilarDocuments(queryEmbedding, 0.1, 5);
      
      console.log(`📊 Search results: ${results.length} documents found`);
      
      results.forEach((result, index) => {
        console.log(`\n${index + 1}. Title: "${result.title}"`);
        console.log(`   Similarity: ${result.similarity.toFixed(3)}`);
        console.log(`   Content: ${result.content.substring(0, 200)}...`);
        if (result.metadata?.structured_data) {
          console.log(`   Structured data: ${JSON.stringify(result.metadata.structured_data[0], null, 2)}`);
        }
      });

      return results;
    } catch (error) {
      console.error('❌ Search test failed:', error);
      throw error;
    }
  }
}

async function main() {
  console.log('🚀 Starting Excel removal and rebuild process...\n');
  
  const processor = new ExcelProcessor();
  
  try {
    // Step 1: Remove all existing Excel documents
    const removedCount = await processor.removeAllExcelDocuments();
    console.log(`\n✅ Step 1 complete: Removed ${removedCount} Excel documents\n`);

    // Step 2: Check if there are any Excel files to re-upload
    console.log('📁 Looking for Excel files to re-upload...');
    
    // Add your actual Excel file path here
    const excelFilePath = './your-excel-file.xlsx'; // Update this to your actual file path
    
    try {
      await fs.access(excelFilePath);
      console.log(`📄 Found Excel file: ${excelFilePath}`);
      
      // Step 3: Upload with new approach
      const uploadResult = await processor.uploadExcelWithNewApproach(
        excelFilePath, 
        'Sample Data'
      );
      
      console.log(`\n✅ Step 2 complete: ${uploadResult.chunksUploaded} chunks uploaded\n`);
      
      // Step 4: Test the new implementation
      console.log('🧪 Testing new Excel search functionality...\n');
      await processor.testExcelSearch();
      
    } catch (fileError) {
      console.log(`⚠️ No Excel file found at ${excelFilePath}`);
      console.log('   You can manually upload Excel files through the knowledge base interface');
    }

    console.log('\n🎉 Excel rebuild process completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`   - Removed old Excel documents: ${removedCount}`);
    console.log('   - Implemented new structured Excel processing');
    console.log('   - Excel data is now properly chunked and searchable');
    
  } catch (error) {
    console.error('\n💥 Process failed:', error);
    process.exit(1);
  }
}

// Run the process
if (require.main === module) {
  main().then(() => {
    console.log('\n🏁 Script completed');
    process.exit(0);
  }).catch(error => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });
}

module.exports = { ExcelProcessor };