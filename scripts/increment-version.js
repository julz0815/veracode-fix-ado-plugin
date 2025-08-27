const fs = require('fs');
const path = require('path');

// Read the vss-extension.json file
const extensionPath = path.join(__dirname, '..', 'vss-extension.json');
const extension = JSON.parse(fs.readFileSync(extensionPath, 'utf8'));

// Parse the current version
const [major, minor, patch] = extension.version.split('.').map(Number);

// Increment the patch version
const newVersion = `${major}.${minor}.${patch + 1}`;

// Update the version in both files
extension.version = newVersion;
fs.writeFileSync(extensionPath, JSON.stringify(extension, null, 4));

// Also update package.json
const packagePath = path.join(__dirname, '..', 'package.json');
const package = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
package.version = newVersion;
fs.writeFileSync(packagePath, JSON.stringify(package, null, 2));

console.log(`Version incremented to ${newVersion}`); 