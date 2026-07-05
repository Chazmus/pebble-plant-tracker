const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'src', 'pkjs', 'config.html');
const jsPath = path.join(__dirname, 'src', 'pkjs', 'config_html.js');

try {
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');
  const escapedHtml = JSON.stringify(htmlContent);
  const jsContent = `// Automatically generated from config.html. Do not edit directly.\nmodule.exports = ${escapedHtml};\n`;

  fs.writeFileSync(jsPath, jsContent, 'utf8');
  console.log('Successfully generated config_html.js from config.html');
} catch (err) {
  console.error('Error generating config_html.js:', err);
  process.exit(1);
}
