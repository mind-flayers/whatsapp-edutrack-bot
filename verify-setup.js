#!/usr/bin/env node

/**
 * Verification script for Firestore-based session storage setup
 * Run this to verify all components are properly configured
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 EduTrack WhatsApp Bot - Setup Verification\n');
console.log('━'.repeat(60));

let allGood = true;

// Check 1: Required files exist
console.log('\n📁 Checking required files...');
const requiredFiles = [
  'firestore-session-sync.js',
  'server-baileys.js',
  'start.js',
  'firebase-bridge.js',
  'package.json',
  '.gitignore',
  'service-account-key.json'
];

requiredFiles.forEach(file => {
  const exists = fs.existsSync(path.join(__dirname, file));
  console.log(`${exists ? '✅' : '❌'} ${file}`);
  if (!exists && file !== 'service-account-key.json') {
    allGood = false;
  }
});

// Check 2: Verify files use Firestore (not Firebase Storage)
console.log('\n🔍 Checking for Firestore integration...');

try {
  const serverBaileys = fs.readFileSync(path.join(__dirname, 'server-baileys.js'), 'utf8');
  
  if (serverBaileys.includes('FirestoreSessionSync')) {
    console.log('✅ server-baileys.js uses FirestoreSessionSync');
  } else {
    console.log('❌ server-baileys.js does not use FirestoreSessionSync');
    allGood = false;
  }

  if (serverBaileys.includes('FirebaseStorageSync')) {
    console.log('⚠️  server-baileys.js still references FirebaseStorageSync (should be removed)');
    allGood = false;
  }

  // Check for actual storageBucket usage (not just comments)
  if (serverBaileys.match(/storageBucket\s*[:=]/)) {
    console.log('⚠️  server-baileys.js still references storageBucket configuration (should be removed)');
    allGood = false;
  } else {
    console.log('✅ server-baileys.js does not use storageBucket configuration');
  }

  const firebaseBridge = fs.readFileSync(path.join(__dirname, 'firebase-bridge.js'), 'utf8');
  
  if (firebaseBridge.includes('const admin = require(\'firebase-admin\')')) {
    console.log('✅ firebase-bridge.js has Firebase Admin import');
  } else {
    console.log('❌ firebase-bridge.js missing Firebase Admin import');
    allGood = false;
  }

  if (firebaseBridge.includes('const axios = require(\'axios\')')) {
    console.log('✅ firebase-bridge.js has axios import');
  } else {
    console.log('❌ firebase-bridge.js missing axios import');
    allGood = false;
  }

} catch (error) {
  console.log(`❌ Error reading files: ${error.message}`);
  allGood = false;
}

// Check 3: Package.json validation
console.log('\n📦 Checking package.json...');

try {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  
  if (packageJson.main === 'start.js') {
    console.log('✅ main entry point is start.js');
  } else {
    console.log('❌ main entry point should be start.js');
    allGood = false;
  }

  if (packageJson.engines && packageJson.engines.node === '18.x') {
    console.log('✅ Node.js engine set to 18.x');
  } else {
    console.log('⚠️  Node.js engine should be set to 18.x for Render');
  }

  const requiredDeps = [
    '@whiskeysockets/baileys',
    'firebase-admin',
    'express',
    'axios',
    'pino',
    'qrcode-terminal'
  ];

  let missingDeps = [];
  requiredDeps.forEach(dep => {
    if (!packageJson.dependencies[dep]) {
      missingDeps.push(dep);
    }
  });

  if (missingDeps.length === 0) {
    console.log('✅ All required dependencies present');
  } else {
    console.log(`❌ Missing dependencies: ${missingDeps.join(', ')}`);
    allGood = false;
  }

} catch (error) {
  console.log(`❌ Error reading package.json: ${error.message}`);
  allGood = false;
}

// Check 4: .gitignore validation
console.log('\n🔒 Checking .gitignore...');

try {
  const gitignore = fs.readFileSync(path.join(__dirname, '.gitignore'), 'utf8');
  
  const requiredIgnores = ['auth_info', 'service-account-key.json', 'node_modules', '.env'];
  
  requiredIgnores.forEach(pattern => {
    if (gitignore.includes(pattern)) {
      console.log(`✅ .gitignore includes ${pattern}`);
    } else {
      console.log(`❌ .gitignore missing ${pattern}`);
      allGood = false;
    }
  });

} catch (error) {
  console.log(`❌ Error reading .gitignore: ${error.message}`);
  allGood = false;
}

// Final summary
console.log('\n' + '━'.repeat(60));
if (allGood) {
  console.log('✅ All checks passed! Setup is correct.');
  console.log('\n📋 Next steps:');
  console.log('1. Ensure service-account-key.json is in this directory');
  console.log('2. Run: npm install');
  console.log('3. Run: npm start (to test locally)');
  console.log('4. Update Firestore Security Rules in Firebase Console');
  console.log('5. Push to GitHub and deploy to Render');
  console.log('\n📖 See RENDER_DEPLOYMENT_COMPLETE_GUIDE.md for detailed steps');
} else {
  console.log('❌ Some checks failed. Please review the issues above.');
  console.log('\n💡 Refer to RENDER_DEPLOYMENT_COMPLETE_GUIDE.md for correct setup');
  process.exit(1);
}

console.log('━'.repeat(60) + '\n');
