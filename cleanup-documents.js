// cleanup-documents.js
// Script to help clean up problematic documents in the knowledge base

require('dotenv').config();
const KnowledgeBaseDB = require('./knowledge-base/database');

async function main() {
  const db = new KnowledgeBaseDB();
  
  try {
    console.log('🔍 Analyzing knowledge base documents...\n');
    
    // Get all documents
    const allDocs = await db.getAllDocuments(1000);
    console.log(`📊 Total documents in database: ${allDocs.length}`);
    
    // Group by filename/title to show duplicates
    const groups = {};
    allDocs.forEach(doc => {
      const key = doc.metadata?.filename || doc.title;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(doc);
    });
    
    console.log(`📁 Unique document groups: ${Object.keys(groups).length}\n`);
    
    // Show document groups
    console.log('📋 Document Groups:');
    console.log('==================');
    Object.entries(groups).forEach(([name, docs]) => {
      console.log(`📄 "${name}"`);
      console.log(`   - Chunks: ${docs.length}`);
      console.log(`   - Source: ${docs[0].source_type || 'unknown'}`);
      console.log(`   - Created: ${docs[0].created_at ? new Date(docs[0].created_at).toLocaleDateString() : 'unknown'}`);
      console.log('');
    });
    
    // Interactive cleanup
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    console.log('🧹 Cleanup Options:');
    console.log('1. Delete specific document groups');
    console.log('2. Delete all documents (DANGER!)');
    console.log('3. Exit without changes');
    
    rl.question('\nChoose an option (1-3): ', async (choice) => {
      try {
        switch (choice) {
          case '1':
            await interactiveDelete(rl, db, groups);
            break;
          case '2':
            rl.question('⚠️  Are you ABSOLUTELY sure you want to delete ALL documents? Type "DELETE ALL" to confirm: ', async (confirm) => {
              if (confirm === 'DELETE ALL') {
                await deleteAllDocuments(db, allDocs);
              } else {
                console.log('❌ Deletion cancelled.');
              }
              rl.close();
            });
            break;
          case '3':
            console.log('👋 Exiting without changes.');
            rl.close();
            break;
          default:
            console.log('❌ Invalid option.');
            rl.close();
        }
      } catch (error) {
        console.error('❌ Error during cleanup:', error);
        rl.close();
      }
    });
    
  } catch (error) {
    console.error('❌ Error analyzing documents:', error);
  }
}

async function interactiveDelete(rl, db, groups) {
  const groupNames = Object.keys(groups);
  
  console.log('\n📋 Available document groups:');
  groupNames.forEach((name, index) => {
    console.log(`${index + 1}. "${name}" (${groups[name].length} chunks)`);
  });
  
  rl.question('\nEnter the numbers of groups to delete (comma-separated, e.g., 1,3,5): ', async (input) => {
    try {
      const indices = input.split(',').map(s => parseInt(s.trim()) - 1);
      const toDelete = indices.filter(i => i >= 0 && i < groupNames.length).map(i => groupNames[i]);
      
      if (toDelete.length === 0) {
        console.log('❌ No valid selections.');
        rl.close();
        return;
      }
      
      console.log(`\n🗑️  Will delete: ${toDelete.join(', ')}`);
      rl.question('Confirm deletion? (y/N): ', async (confirm) => {
        if (confirm.toLowerCase() === 'y') {
          for (const name of toDelete) {
            try {
              let result;
              if (name.includes('.')) {
                result = await db.deleteDocumentGroup(name);
              } else {
                result = await db.deleteDocumentsByTitle(name);
              }
              console.log(`✅ Deleted "${name}" (${result.deletedCount} chunks)`);
            } catch (error) {
              console.error(`❌ Failed to delete "${name}":`, error.message);
            }
          }
          console.log('\n🎉 Cleanup completed!');
        } else {
          console.log('❌ Deletion cancelled.');
        }
        rl.close();
      });
    } catch (error) {
      console.error('❌ Error processing selection:', error);
      rl.close();
    }
  });
}

async function deleteAllDocuments(db, allDocs) {
  console.log('🗑️  Deleting all documents...');
  
  let deleted = 0;
  for (const doc of allDocs) {
    try {
      await db.deleteDocument(doc.id);
      deleted++;
    } catch (error) {
      console.error(`❌ Failed to delete document ${doc.id}:`, error.message);
    }
  }
  
  console.log(`✅ Deleted ${deleted} out of ${allDocs.length} documents.`);
}

if (require.main === module) {
  main().then(() => {
    console.log('\n👋 Script completed.');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
}

module.exports = { main };