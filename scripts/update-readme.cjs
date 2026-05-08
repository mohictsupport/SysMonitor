/**
 * Updates README.md with current version from package.json and current year
 * Run this before building: node scripts/update-readme.js
 */

const fs = require('fs');
const path = require('path');

const packageJson = require('../package.json');
const version = packageJson.version;
const currentYear = new Date().getFullYear();
const yearRange = `2025-${currentYear}`;

const readmePath = path.join(__dirname, '..', 'README.md');
let readmeContent = fs.readFileSync(readmePath, 'utf8');

// Update version badge
readmeContent = readmeContent.replace(
  /\(https:\/\/img\.shields\.io\/badge\/version-[\d.]+-blue\)/,
  `(https://img.shields.io/badge/version-${version}-blue)`
);

// Update version in footer
readmeContent = readmeContent.replace(
  /\*\*SysMonitor\*\* • Version [\d.]+ •/,
  `**SysMonitor** • Version ${version} •`
);

// Update year in footer
readmeContent = readmeContent.replace(
  /© \d{4}-\d{4}/,
  `© ${yearRange}`
);

fs.writeFileSync(readmePath, readmeContent);
console.log(`✅ README updated: Version ${version}, Year ${yearRange}`);
