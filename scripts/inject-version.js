/**
 * Injects version from package.json into AppFooter.tsx at build time
 * Run this before building: node scripts/inject-version.js
 */

const fs = require('fs');
const path = require('path');

const packageJson = require('../package.json');
const version = packageJson.version;
const currentYear = new Date().getFullYear();

const footerPath = path.join(__dirname, '..', 'src', 'components', 'AppFooter.tsx');
let footerContent = fs.readFileSync(footerPath, 'utf8');

// Update version constant
footerContent = footerContent.replace(
  /const APP_VERSION = "[\d.]+";/,
  `const APP_VERSION = "${version}";`
);

// Update year constant  
footerContent = footerContent.replace(
  /const CURRENT_YEAR = new Date\(\)\.getFullYear\(\);/,
  `const CURRENT_YEAR = ${currentYear};`
);

fs.writeFileSync(footerPath, footerContent);
console.log(`✅ AppFooter updated: Version ${version}, Year ${currentYear}`);
