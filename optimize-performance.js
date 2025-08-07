// optimize-performance.js - Remove debug logs and optimize for low-resource server
const fs = require('fs');

function optimizeFile(filePath) {
  console.log(`🔧 Optimizing ${filePath}...`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  let changes = 0;
  
  // Remove console.log statements (keep console.error)
  const logPatterns = [
    /console\.log\([^)]*\);?\n?/g,
    /console\.log\(`[^`]*`[^)]*\);?\n?/g,
    /console\.log\('[^']*'[^)]*\);?\n?/g,
    /console\.log\("[^"]*"[^)]*\);?\n?/g
  ];
  
  logPatterns.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      changes += matches.length;
      content = content.replace(pattern, '');
    }
  });
  
  // Remove debug blocks
  content = content.replace(/\/\/ DEBUG START[\s\S]*?\/\/ DEBUG END\n?/g, '');
  content = content.replace(/console\.log\(`\\n=== [^`]* ===`\);[\s\S]*?console\.log\(`=== END [^`]* ===\\n`\);/g, '');
  
  // Remove empty lines (more than 2 consecutive)
  content = content.replace(/\n\n\n+/g, '\n\n');
  
  fs.writeFileSync(filePath, content);
  console.log(`✅ Removed ${changes} debug statements from ${filePath}`);
}

// Optimize main files
const filesToOptimize = [
  './server.js',
  './knowledge-base/database.js',
  './knowledge-base/embeddings.js',
  './knowledge-base/document-processor.js'
];

filesToOptimize.forEach(file => {
  try {
    optimizeFile(file);
  } catch (error) {
    console.log(`⚠️ Could not optimize ${file}: ${error.message}`);
  }
});

console.log('🎉 Performance optimization completed!');