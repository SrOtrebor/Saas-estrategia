const fs = require('fs');
const content = fs.readFileSync('E:/SaaS-estrategias/muestras_diseños.html', 'utf8');
const regex = /src="data:text\/html;base64,([^"]+)"/g;
let match;
let i=1;
while((match = regex.exec(content)) !== null) {
  console.log('--- Plantilla ' + i + ' ---');
  console.log(Buffer.from(match[1], 'base64').toString('utf8'));
  i++;
}
