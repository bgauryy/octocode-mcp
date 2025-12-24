#!/usr/bin/env node
/**
 * Script to check for duplicate API key patterns in regexes.ts
 * Run: node scripts/check-regex-duplicates.js
 */

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/security/regexes.ts');
const content = fs.readFileSync(filePath, 'utf8');

// Extract all patterns
const patternRegex = /\{\s*name:\s*['"]([^'"]+)['"],\s*description:\s*['"]([^'"]+)['"],\s*regex:\s*(\/[^]+?\/[gim]*),/g;

const patterns = [];
let match;

// Simple extraction of name and regex lines
const lines = content.split('\n');
let currentName = null;
let currentRegex = null;
let lineNum = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  lineNum = i + 1;

  const nameMatch = line.match(/name:\s*['"]([^'"]+)['"]/);
  if (nameMatch) {
    currentName = nameMatch[1];
  }

  const regexMatch = line.match(/regex:\s*(\/.*\/[gim]*)/);
  if (regexMatch && currentName) {
    patterns.push({
      name: currentName,
      regex: regexMatch[1],
      line: lineNum
    });
    currentName = null;
  }

  // Handle multi-line regex (regex on next line)
  if (line.trim() === 'regex:' || line.includes('regex:') && !line.includes('/')) {
    const nextLine = lines[i + 1];
    if (nextLine) {
      const nextRegexMatch = nextLine.match(/^\s*(\/.*\/[gim]*)/);
      if (nextRegexMatch && currentName) {
        patterns.push({
          name: currentName,
          regex: nextRegexMatch[1],
          line: lineNum + 1
        });
        currentName = null;
      }
    }
  }
}

console.log('='.repeat(60));
console.log('API Key Pattern Duplicate Checker');
console.log('='.repeat(60));
console.log('');

// Check for duplicate names
const nameMap = new Map();
patterns.forEach(p => {
  if (!nameMap.has(p.name)) {
    nameMap.set(p.name, []);
  }
  nameMap.get(p.name).push(p);
});

const duplicateNames = [...nameMap.entries()].filter(([k, v]) => v.length > 1);
if (duplicateNames.length > 0) {
  console.log('DUPLICATE NAMES FOUND:');
  duplicateNames.forEach(([name, occurrences]) => {
    console.log('  "' + name + '" at lines: ' + occurrences.map(o => o.line).join(', '));
  });
  console.log('');
} else {
  console.log('No duplicate names found');
}

// Check for duplicate regexes
const regexMap = new Map();
patterns.forEach(p => {
  if (!regexMap.has(p.regex)) {
    regexMap.set(p.regex, []);
  }
  regexMap.get(p.regex).push(p);
});

const duplicateRegexes = [...regexMap.entries()].filter(([k, v]) => v.length > 1);
if (duplicateRegexes.length > 0) {
  console.log('DUPLICATE REGEXES FOUND:');
  duplicateRegexes.forEach(([regex, occurrences]) => {
    console.log('  Regex: ' + regex.slice(0, 80) + (regex.length > 80 ? '...' : ''));
    occurrences.forEach(o => {
      console.log('    - "' + o.name + '" at line ' + o.line);
    });
  });
  console.log('');
} else {
  console.log('No duplicate regexes found');
}

// Check for similar regexes (normalized - ignore case of character classes and flags)
const normalizeRegex = (r) => {
  return r
    .replace(/\/[gim]*$/, '')  // Remove flags
    .replace(/\[a-zA-Z/g, '[A-Za-z')  // Normalize char class order
    .replace(/\[A-Za-z/g, '[a-zA-Z')
    .replace(/\[0-9a-f/gi, '[a-f0-9')
    .toLowerCase();
};

const normalizedMap = new Map();
patterns.forEach(p => {
  const normalized = normalizeRegex(p.regex);
  if (!normalizedMap.has(normalized)) {
    normalizedMap.set(normalized, []);
  }
  normalizedMap.get(normalized).push(p);
});

const similarRegexes = [...normalizedMap.entries()].filter(([k, v]) => v.length > 1);
if (similarRegexes.length > 0) {
  console.log('SIMILAR REGEXES (may differ only by flags/case):');
  similarRegexes.forEach(([_, occurrences]) => {
    if (occurrences.length > 1) {
      console.log('  Group:');
      occurrences.forEach(o => {
        console.log('    - "' + o.name + '" at line ' + o.line);
        console.log('      ' + o.regex.slice(0, 70) + (o.regex.length > 70 ? '...' : ''));
      });
    }
  });
  console.log('');
}

// Summary
console.log('='.repeat(60));
console.log('SUMMARY');
console.log('='.repeat(60));
console.log('  Total patterns: ' + patterns.length);
console.log('  Unique names: ' + nameMap.size);
console.log('  Unique regexes: ' + regexMap.size);

const hasErrors = duplicateNames.length > 0 || duplicateRegexes.length > 0;
if (hasErrors) {
  console.log('');
  console.log('ERRORS FOUND - Please fix duplicates above');
  process.exit(1);
} else {
  console.log('');
  console.log('All checks passed!');
  process.exit(0);
}
