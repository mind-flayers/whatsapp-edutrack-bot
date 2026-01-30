#!/usr/bin/env node

/**
 * WhatsApp Connection Diagnostic Tool
 * Run this to diagnose connection issues before starting the bot
 */

const https = require('https');
const dns = require('dns').promises;
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

console.log('🔍 WhatsApp Bot Connection Diagnostics\n');
console.log('━'.repeat(60));

async function checkDNS() {
  console.log('\n📡 Checking DNS Resolution...');
  try {
    const addresses = await dns.resolve4('web.whatsapp.com');
    console.log('✅ web.whatsapp.com resolves to:', addresses[0]);
    return true;
  } catch (error) {
    console.log('❌ DNS resolution failed:', error.message);
    console.log('💡 Check your internet connection or DNS settings');
    return false;
  }
}

async function checkHTTPS() {
  console.log('\n🌐 Checking HTTPS Connection to WhatsApp...');
  return new Promise((resolve) => {
    const options = {
      hostname: 'web.whatsapp.com',
      port: 443,
      path: '/',
      method: 'GET',
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      console.log('✅ HTTPS connection successful');
      console.log('   Status:', res.statusCode);
      console.log('   Headers:', JSON.stringify(res.headers, null, 2));
      resolve(true);
    });

    req.on('error', (error) => {
      console.log('❌ HTTPS connection failed:', error.message);
      console.log('💡 Possible firewall or proxy issue');
      resolve(false);
    });

    req.on('timeout', () => {
      console.log('❌ Connection timeout');
      console.log('💡 Network too slow or firewall blocking');
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

async function checkWebSocket() {
  console.log('\n🔌 Checking WebSocket Support...');
  try {
    // Check if ws module is available
    require.resolve('ws');
    console.log('✅ WebSocket module (ws) is installed');
    return true;
  } catch (error) {
    console.log('❌ WebSocket module not found');
    console.log('💡 Run: npm install ws');
    return false;
  }
}

async function checkFirebaseConnection() {
  console.log('\n🔥 Checking Firebase Connection...');
  try {
    const admin = require('firebase-admin');
    
    let serviceAccount;
    try {
      serviceAccount = require('./service-account-key.json');
    } catch (error) {
      console.log('❌ service-account-key.json not found');
      return false;
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }

    const db = admin.firestore();
    await db.collection('test').doc('connection-test').set({
      timestamp: new Date(),
      test: true
    });

    console.log('✅ Firebase connection successful');
    
    // Clean up test document
    await db.collection('test').doc('connection-test').delete();
    
    return true;
  } catch (error) {
    console.log('❌ Firebase connection failed:', error.message);
    console.log('💡 Check your service-account-key.json');
    return false;
  }
}

async function checkNodeVersion() {
  console.log('\n📦 Checking Node.js Version...');
  const version = process.version;
  const major = parseInt(version.slice(1).split('.')[0]);
  
  console.log('   Current version:', version);
  
  if (major >= 18) {
    console.log('✅ Node.js version is compatible (>= 18)');
    return true;
  } else {
    console.log('❌ Node.js version too old (need >= 18)');
    console.log('💡 Update Node.js: https://nodejs.org/');
    return false;
  }
}

async function checkBaileysVersion() {
  console.log('\n📚 Checking Baileys Version...');
  try {
    const packageJson = require('./package.json');
    const baileysVersion = packageJson.dependencies['@whiskeysockets/baileys'];
    console.log('   Installed version:', baileysVersion);
    console.log('✅ Baileys is installed');
    return true;
  } catch (error) {
    console.log('❌ Baileys not found in package.json');
    console.log('💡 Run: npm install @whiskeysockets/baileys@latest');
    return false;
  }
}

async function checkAuthFolder() {
  console.log('\n📁 Checking Auth Folder...');
  const fs = require('fs');
  const path = require('path');
  
  const authPath = path.join(__dirname, 'auth_info');
  
  if (fs.existsSync(authPath)) {
    const files = fs.readdirSync(authPath);
    console.log(`✅ auth_info folder exists (${files.length} files)`);
    
    if (files.length > 0) {
      console.log('   Files:', files.slice(0, 5).join(', '));
      if (files.length > 5) console.log(`   ... and ${files.length - 5} more`);
    } else {
      console.log('⚠️  auth_info folder is empty (new QR scan needed)');
    }
    return true;
  } else {
    console.log('ℹ️  auth_info folder does not exist (will be created)');
    return true;
  }
}

async function checkFirewall() {
  console.log('\n🛡️ Checking Firewall Status...');
  
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execPromise('netsh advfirewall show allprofiles state');
      if (stdout.includes('ON') || stdout.includes('State                                 ON')) {
        console.log('⚠️  Windows Firewall is enabled');
        console.log('💡 May need to allow Node.js through firewall');
        console.log('💡 Run: netsh advfirewall firewall add rule name="WhatsApp Bot" dir=in action=allow program="' + process.execPath + '" enable=yes');
      } else {
        console.log('✅ Windows Firewall is disabled or not blocking');
      }
      return true;
    } catch (error) {
      console.log('ℹ️  Could not check firewall status');
      return true;
    }
  } else {
    console.log('ℹ️  Firewall check not available on this platform');
    return true;
  }
}

async function runDiagnostics() {
  const results = {
    node: await checkNodeVersion(),
    baileys: await checkBaileysVersion(),
    authFolder: await checkAuthFolder(),
    dns: await checkDNS(),
    https: await checkHTTPS(),
    websocket: await checkWebSocket(),
    firebase: await checkFirebaseConnection(),
    firewall: await checkFirewall()
  };

  console.log('\n' + '━'.repeat(60));
  console.log('📊 Diagnostic Summary\n');

  const passed = Object.values(results).filter(r => r === true).length;
  const total = Object.keys(results).length;

  Object.entries(results).forEach(([test, result]) => {
    const icon = result ? '✅' : '❌';
    const label = test.charAt(0).toUpperCase() + test.slice(1);
    console.log(`${icon} ${label.padEnd(15)} ${result ? 'PASS' : 'FAIL'}`);
  });

  console.log('\n' + '━'.repeat(60));
  console.log(`\n🎯 Result: ${passed}/${total} checks passed`);

  if (passed === total) {
    console.log('\n✅ All diagnostics passed! Connection should work.');
    console.log('💡 If you still have issues, try:');
    console.log('   1. Delete auth_info folder and scan QR code again');
    console.log('   2. Update Baileys: npm install @whiskeysockets/baileys@latest');
    console.log('   3. Check antivirus/firewall settings');
  } else {
    console.log('\n⚠️  Some checks failed. Review the issues above.');
    console.log('💡 Fix the failed checks before running npm start');
  }

  console.log('━'.repeat(60) + '\n');

  // Exit with appropriate code
  process.exit(passed === total ? 0 : 1);
}

// Run diagnostics
runDiagnostics().catch(error => {
  console.error('\n❌ Diagnostic error:', error.message);
  process.exit(1);
});
