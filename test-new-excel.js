// test-new-excel.js
require('dotenv').config();
const { ExcelProcessor } = require('./remove-excel-and-rebuild');

async function testNewExcelFunctionality() {
  console.log('🧪 Testing new Excel functionality...\n');
  
  const processor = new ExcelProcessor();
  
  try {
    // Test search functionality
    const queries = [
      "How many tickets are assigned to Saw Andrew?",
      "What is the status of tickets?",
      "Show me ticket information",
      "Who is working on tickets?"
    ];
    
    for (const query of queries) {
      console.log(`\n🔍 Testing query: "${query}"`);
      console.log('─'.repeat(50));
      
      try {
        const results = await processor.testExcelSearch(query);
        
        if (results.length === 0) {
          console.log('❌ No results found');
        } else {
          console.log(`✅ Found ${results.length} relevant results`);
        }
      } catch (error) {
        console.error(`❌ Query failed: ${error.message}`);
      }
      
      // Add delay between queries
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n🎉 Excel functionality test completed!');
    
  } catch (error) {
    console.error('💥 Test failed:', error);
  }
}

// Run the test
if (require.main === module) {
  testNewExcelFunctionality().then(() => {
    console.log('\n🏁 Test completed');
    process.exit(0);
  }).catch(error => {
    console.error('\n💥 Test failed:', error);
    process.exit(1);
  });
}

module.exports = { testNewExcelFunctionality };