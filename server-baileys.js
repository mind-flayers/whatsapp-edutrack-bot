const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const express = require('express');
const bodyParser = require('body-parser');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const admin = require('firebase-admin');
const FirebaseStorageSync = require('./firebase-storage-sync');

// Initialize Firebase Admin (if not already initialized)
if (!admin.apps.length) {
  try {
    let serviceAccount;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } else {
      serviceAccount = require('./service-account-key.json');
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'edutrack-73a2e.appspot.com'
    });
    console.log('✅ Firebase Admin initialized for storage sync');
  } catch (error) {
    console.error('⚠️ Firebase Admin init warning:', error.message);
  }
}

// Initialize storage sync
const storageSync = new FirebaseStorageSync(process.env.FIREBASE_STORAGE_BUCKET || 'edutrack-73a2e.appspot.com');

// Express app setup
const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// Global state
let sock = null;
let isConnected = false;
let qrCode = null;

// Logger configuration (reduced logging for cleaner output)
const logger = pino({ level: 'silent' });

console.log('🚀 EduTrack WhatsApp Bot with Baileys');
console.log('📱 Waiting for WhatsApp connection...');

// Initialize WhatsApp connection
async function connectToWhatsApp() {
  try {
    // Download session from Firebase Storage on startup
    const hasRemoteSession = await storageSync.hasRemoteSession();
    if (hasRemoteSession) {
      console.log('📥 Downloading session from Firebase Storage...');
      await storageSync.downloadAuthInfo();
    } else {
      console.log('ℹ️ No remote session found, will create new one');
    }

    // Get latest version info
    const { version } = await fetchLatestBaileysVersion();
    console.log(`📦 Using Baileys version: ${version.join('.')}`);

    // Multi-file auth state
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    // Create socket
    sock = makeWASocket({
      version,
      auth: state,
      logger,
      defaultQueryTimeoutMs: undefined,
    });

    // Save credentials on update AND upload to Firebase Storage
    sock.ev.on('creds.update', async () => {
      await saveCreds();

      // Upload to Firebase Storage after credentials update
      console.log('💾 Syncing session to Firebase Storage...');
      await storageSync.uploadAuthInfo();
    });

    // Connection updates
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // QR code for pairing
      if (qr) {
        qrCode = qr;
        console.log('\n📱 SCAN THIS QR CODE WITH WHATSAPP:\n');
        qrcode.generate(qr, { small: true });
        console.log('\n✅ Scan the QR code above with WhatsApp (Linked Devices)\n');
      }

      // Connection status
      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

        console.log('❌ Connection closed');

        if (lastDisconnect?.error) {
          console.log('Error:', lastDisconnect.error.message);
        }

        isConnected = false;

        if (shouldReconnect) {
          console.log('🔄 Reconnecting...');
          setTimeout(() => connectToWhatsApp(), 3000);
        } else {
          console.log('🚪 Logged out - clearing remote session');
          await storageSync.clearRemoteSession();
          qrCode = null;
        }
      } else if (connection === 'open') {
        isConnected = true;
        qrCode = null;
        console.log('✅ WhatsApp connected successfully!');
        console.log('🎯 Bot is ready to send messages');

        // Upload session immediately after successful connection
        console.log('💾 Backing up session to Firebase Storage...');
        await storageSync.uploadAuthInfo();
      } else if (connection === 'connecting') {
        console.log('⏳ Connecting to WhatsApp...');
      }
    });

    // Messages handler (optional - for receiving messages)
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type === 'notify') {
        for (const msg of messages) {
          if (!msg.key.fromMe && msg.message) {
            const messageText = msg.message.conversation ||
              msg.message.extendedTextMessage?.text || '';

            console.log(`📩 Received: ${messageText} from ${msg.key.remoteJid}`);
          }
        }
      }
    });

  } catch (error) {
    console.error('❌ Connection error:', error.message);

    // Retry connection after 10 seconds
    setTimeout(() => {
      console.log('🔄 Retrying connection...');
      connectToWhatsApp();
    }, 10000);
  }
}

// Format phone number to WhatsApp JID format
function formatPhoneNumber(phone) {
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, '');

  // Convert Sri Lankan local format (077...) to international (94...)
  if (cleaned.startsWith('0')) {
    cleaned = '94' + cleaned.substring(1);
  }

  // Ensure it doesn't start with +
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }

  // Return WhatsApp JID format
  return cleaned + '@s.whatsapp.net';
}

// API Endpoints

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'online',
    whatsapp_ready: isConnected,
    message: isConnected ? 'WhatsApp is connected and ready' : 'WhatsApp is not connected',
    timestamp: new Date().toISOString()
  });
});

// Status endpoint
app.get('/status', (req, res) => {
  res.json({
    connected: isConnected,
    has_qr: qrCode !== null,
    timestamp: new Date().toISOString()
  });
});

// Send message endpoint
app.post('/send-message', async (req, res) => {
  try {
    if (!isConnected) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp is not connected. Please scan QR code first.'
      });
    }

    const { number, message } = req.body;

    if (!number || !message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: number and message'
      });
    }

    // Format phone number
    const jid = formatPhoneNumber(number);

    console.log(`📤 Sending message to ${number} (${jid})`);

    // Send message
    await sock.sendMessage(jid, { text: message });

    console.log(`✅ Message sent successfully to ${number}`);

    res.json({
      success: true,
      message: 'Message sent successfully',
      recipient: number,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error sending message:', error.message);

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to send message'
    });
  }
});

// Attendance notification endpoint (for Firebase Bridge compatibility)
app.post('/notify/attendance', async (req, res) => {
  try {
    const { studentName, parentPhone, status, date } = req.body;

    const message = `📚 EduTrack Attendance Notification\n\n` +
      `Student: ${studentName}\n` +
      `Status: ${status}\n` +
      `Date: ${date}\n\n` +
      `Thank you for choosing EduTrack.`;

    return await app.request.post('/send-message', {
      body: JSON.stringify({ number: parentPhone, message })
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Payment notification endpoint (for Firebase Bridge compatibility)
app.post('/notify/payment', async (req, res) => {
  try {
    const { studentName, parentPhone, amount, status, month } = req.body;

    const message = `💰 EduTrack Payment Notification\n\n` +
      `Student: ${studentName}\n` +
      `Amount: Rs. ${amount}\n` +
      `Status: ${status}\n` +
      `Month: ${month}\n\n` +
      `Thank you for your payment!`;

    return await app.request.post('/send-message', {
      body: JSON.stringify({ number: parentPhone, message })
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🌐 Server running on http://localhost:${PORT}`);
  console.log(`📡 Endpoints:`);
  console.log(`   GET  /health - Check bot status`);
  console.log(`   GET  /status - Connection status`);
  console.log(`   POST /send-message - Send WhatsApp message`);
  console.log('');

  // Connect to WhatsApp
  connectToWhatsApp();
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Shutting down gracefully...');
  if (sock) {
    await sock.logout();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n👋 Shutting down gracefully...');
  if (sock) {
    await sock.logout();
  }
  process.exit(0);
});
