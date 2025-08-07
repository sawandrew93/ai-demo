// knowledge-base/document-processor.js
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const xlsx = require('xlsx');
const fs = require('fs').promises;

class DocumentProcessor {
  constructor() {
    this.chunkSize = 1000; // Characters per chunk
    this.chunkOverlap = 200; // Overlap between chunks
  }

  async processPDF(filePath) {
    try {
      console.log(`📄 Processing PDF: ${filePath}`);
      
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdf(dataBuffer);
      
      const text = data.text;
      const metadata = {
        pages: data.numpages,
        info: data.info,
        source_type: 'pdf',
        filename: filePath.split(/[\\\/]/).pop()
      };

      console.log(`✅ Extracted ${text.length} characters from ${data.numpages} pages`);
      
      return {
        text: text,
        metadata: metadata
      };
    } catch (error) {
      console.error('❌ Error processing PDF:', error);
      throw error;
    }
  }

  async processTextFile(filePath) {
    try {
      console.log(`📄 Processing text file: ${filePath}`);
      
      const text = await fs.readFile(filePath, 'utf-8');
      const metadata = {
        source_type: 'text',
        filename: filePath.split(/[\\\/]/).pop()
      };

      console.log(`✅ Extracted ${text.length} characters`);
      
      return {
        text: text,
        metadata: metadata
      };
    } catch (error) {
      console.error('❌ Error processing text file:', error);
      throw error;
    }
  }

  async processWordFile(filePath) {
    try {
      console.log(`📄 Processing Word file: ${filePath}`);
      
      const result = await mammoth.extractRawText({ path: filePath });
      const text = result.value;
      const metadata = {
        source_type: 'word',
        filename: filePath.split(/[\\\/]/).pop()
      };

      console.log(`✅ Extracted ${text.length} characters from Word document`);
      console.log(`📝 Sample content: ${text.substring(0, 200)}...`);
      
      return {
        text: text,
        metadata: metadata
      };
    } catch (error) {
      console.error('❌ Error processing Word file:', error);
      throw error;
    }
  }

  async processExcelFile(filePath) {
    try {
      console.log(`📄 Processing Excel file: ${filePath}`);
      
      const workbook = xlsx.readFile(filePath);
      const sheetName = workbook.SheetNames[0]; // Use first sheet
      const sheet = workbook.Sheets[sheetName];
      
      // Convert to JSON with proper headers
      const jsonData = xlsx.utils.sheet_to_json(sheet);
      console.log(`📊 Found ${jsonData.length} rows in Excel`);
      
      // Return individual rows for separate processing
      const rows = jsonData.map((row, index) => {
        const rowNumber = index + 2; // Excel row number (header is row 1)
        
        // Create comprehensive text for this record
        const recordText = Object.entries(row)
          .filter(([key, value]) => value !== null && value !== undefined && value !== '')
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ');
        
        return {
          text: `Row ${rowNumber}: ${recordText}`,
          metadata: {
            source_type: 'xlsx',
            filename: filePath.split(/[\\\/]/).pop(),
            row_number: rowNumber,
            record_data: row
          },
          title: `${filePath.split(/[\\\/]/).pop()} - Row ${rowNumber}`
        };
      });
      
      console.log(`✅ Processed ${rows.length} individual records`);
      
      return {
        text: '', // Not used for individual rows
        metadata: {
          source_type: 'xlsx',
          filename: filePath.split(/[\\\/]/).pop(),
          total_rows: rows.length,
          individual_rows: rows
        }
      };
    } catch (error) {
      console.error('❌ Error processing Excel file:', error);
      throw error;
    }
  }

  chunkText(text, title = '') {
    if (!text || text.trim().length === 0) {
      return [];
    }

    const chunks = [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    let currentChunk = '';
    let currentLength = 0;

    for (const sentence of sentences) {
      const sentenceLength = sentence.trim().length;
      
      // If adding this sentence would exceed chunk size, save current chunk
      if (currentLength + sentenceLength > this.chunkSize && currentChunk.length > 0) {
        chunks.push({
          content: currentChunk.trim(),
          title: title,
          length: currentLength
        });
        
        // Start new chunk with overlap
        const words = currentChunk.split(' ');
        const overlapWords = words.slice(-Math.floor(this.chunkOverlap / 5)); // Approximate word overlap
        currentChunk = overlapWords.join(' ') + ' ' + sentence.trim();
        currentLength = currentChunk.length;
      } else {
        currentChunk += ' ' + sentence.trim();
        currentLength = currentChunk.length;
      }
    }

    // Add the last chunk if it has content
    if (currentChunk.trim().length > 0) {
      chunks.push({
        content: currentChunk.trim(),
        title: title,
        length: currentLength
      });
    }

    console.log(`📝 Created ${chunks.length} chunks from text`);
    return chunks;
  }

  cleanText(text) {
    return text
      .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
      .replace(/\n+/g, ' ') // Replace newlines with space
      .replace(/[^\w\s.,!?;:()\-"'|]/g, '') // Keep pipe character for Excel data
      .trim();
  }

  async processDocument(filePath, title = '', fileType = null) {
    try {
      // Use provided file type or detect from extension
      let extension;
      if (fileType) {
        extension = fileType.toLowerCase();
      } else {
        const pathParts = filePath.split('.');
        extension = pathParts.length > 1 ? pathParts.pop().toLowerCase() : '';
      }
      
      console.log(`📄 Processing document with type: ${extension}`);
      let result;

      switch (extension) {
        case 'pdf':
          result = await this.processPDF(filePath);
          break;
        case 'txt':
        case 'md':
          result = await this.processTextFile(filePath);
          break;
        case 'docx':
        case 'doc':
          result = await this.processWordFile(filePath);
          break;
        case 'xlsx':
        case 'xls':
          result = await this.processExcelFile(filePath);
          break;
        default:
          throw new Error(`Unsupported file type: ${extension} (from path: ${filePath})`);
      }

      // Clean the extracted text
      const cleanedText = this.cleanText(result.text);
      
      // Create chunks with the provided title
      const documentTitle = title || result.metadata.filename.replace(/\.[^/.]+$/, '');
      const chunks = this.chunkText(cleanedText, documentTitle);
      
      return {
        chunks: chunks,
        metadata: result.metadata,
        originalText: cleanedText
      };
    } catch (error) {
      console.error('❌ Error processing document:', error);
      throw error;
    }
  }
}

module.exports = DocumentProcessor;