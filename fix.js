const fs = require('fs');

const path = 'src/pages/BulkCalling.jsx';
let content = fs.readFileSync(path, 'utf8');

// Replace \` with `
content = content.replace(/\\`/g, '`');

// Replace \${ with ${
content = content.replace(/\\\${/g, '${');

fs.writeFileSync(path, content);
console.log('Fixed BulkCalling.jsx');
