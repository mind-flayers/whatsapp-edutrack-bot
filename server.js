const { Client, LocalAuth } = require('whatsapp-web.js');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const qrcode = require('qrcode-terminal');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// WhatsApp Client with persistent session
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: './whatsapp-session', // Local storage for development
    clientId: process.env.CLIENT_ID || 'edutrack-bot'
  }),
  puppeteer: {
    headless: false, // Set to true in production
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  }
});

// QR Code for initial authentication
client.on('qr', (qr) => {
  console.log('📱 QR Code received! Please scan with your WhatsApp:');
  qrcode.generate(qr, { small: true });
  console.log('\n🔗 Or visit: https://wwebjs.dev/qr and scan the QR above');
});

client.on('ready', () => {
  console.log('✅ WhatsApp client is ready!');
  console.log('📞 Phone number:', client.info.wid.user);
});

client.on('authenticated', () => {
  console.log('🔐 WhatsApp client authenticated successfully');
});

client.on('auth_failure', (msg) => {
  console.error('❌ Authentication failed:', msg);
});

client.on('disconnected', (reason) => {
  console.log('📱 WhatsApp client disconnected:', reason);
});

// Store for message tracking
const messageLog = [];

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    whatsapp_ready: client.info ? true : false,
    phone_number: client.info ? client.info.wid.user : null,
    timestamp: new Date().toISOString(),
    messages_sent_today: messageLog.filter(msg => 
      new Date(msg.timestamp).toDateString() === new Date().toDateString()
    ).length
  });
});

// Send message endpoint
app.post('/send-message', async (req, res) => {
  try {
    const { phoneNumber, message, type = 'text' } = req.body;

    if (!phoneNumber || !message) {
      return res.status(400).json({ 
        error: 'Phone number and message are required',
        example: {
          phoneNumber: '+94771234567',
          message: 'Hello from EduTrack!',
          type: 'text'
        }
      });
    }

    // Format phone number (remove spaces, special chars, ensure country code)
    let formattedNumber = phoneNumber.replace(/[\s\-\(\)]/g, '');
    
    // Add country code if missing (assuming Sri Lanka +94)
    if (!formattedNumber.startsWith('+')) {
      if (formattedNumber.startsWith('0')) {
        formattedNumber = '+94' + formattedNumber.substring(1);
      } else if (formattedNumber.startsWith('94')) {
        formattedNumber = '+' + formattedNumber;
      } else {
        formattedNumber = '+94' + formattedNumber;
      }
    }

    // Convert to WhatsApp format
    const whatsappNumber = formattedNumber.replace('+', '') + '@c.us';

    // Check if number exists on WhatsApp
    const isRegistered = await client.isRegisteredUser(whatsappNumber);
    if (!isRegistered) {
      return res.status(400).json({ 
        error: 'Phone number is not registered on WhatsApp',
        phoneNumber: formattedNumber
      });
    }

    // Send message
    const sentMessage = await client.sendMessage(whatsappNumber, message);

    // Log the message
    messageLog.push({
      phoneNumber: formattedNumber,
      messageId: sentMessage.id.id,
      type: type,
      timestamp: new Date().toISOString(),
      status: 'sent'
    });

    res.json({ 
      success: true,
      messageId: sentMessage.id.id,
      phoneNumber: formattedNumber,
      timestamp: new Date().toISOString(),
      message: 'Message sent successfully'
    });

    console.log(`✅ Message sent to ${formattedNumber}`);
    console.log(`📝 Message: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);

  } catch (error) {
    console.error('❌ Error sending message:', error);
    
    // Log failed message
    messageLog.push({
      phoneNumber: req.body.phoneNumber,
      error: error.message,
      timestamp: new Date().toISOString(),
      status: 'failed'
    });

    res.status(500).json({ 
      error: 'Failed to send message',
      details: error.message,
      suggestion: 'Make sure the phone number is correct and registered on WhatsApp'
    });
  }
});

// Get client info
app.get('/info', async (req, res) => {
  try {
    if (!client.info) {
      return res.status(503).json({ 
        error: 'WhatsApp client not ready',
        status: 'initializing'
      });
    }

    res.json({
      client_info: {
        phone: client.info.wid.user,
        name: client.info.pushname,
        platform: client.info.platform
      },
      ready: true,
      session_active: true
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.message,
      status: 'error'
    });
  }
});

// Get message logs
app.get('/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const recentLogs = messageLog.slice(-limit).reverse();
  
  res.json({
    total_messages: messageLog.length,
    recent_messages: recentLogs,
    stats: {
      sent_today: messageLog.filter(msg => 
        new Date(msg.timestamp).toDateString() === new Date().toDateString() && 
        msg.status === 'sent'
      ).length,
      failed_today: messageLog.filter(msg => 
        new Date(msg.timestamp).toDateString() === new Date().toDateString() && 
        msg.status === 'failed'
      ).length
    }
  });
});

// Test endpoint for development
app.post('/test-message', async (req, res) => {
  try {
    const testNumber = process.env.TEST_PHONE || req.body.phoneNumber;
    
    if (!testNumber) {
      return res.status(400).json({
        error: 'No test phone number provided',
        solution: 'Either set TEST_PHONE in .env or provide phoneNumber in request'
      });
    }

    const testMessage = `🧪 Test Message from EduTrack WhatsApp Bot\n\nTime: ${new Date().toLocaleString()}\nStatus: Bot is working correctly!`;
    
    const response = await fetch('http://localhost:3000/send-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber: testNumber,
        message: testMessage,
        type: 'test'
      })
    });

    const result = await response.json();
    res.json({
      test_result: result,
      test_phone: testNumber
    });

  } catch (error) {
    res.status(500).json({
      error: 'Test failed',
      details: error.message
    });
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  console.log('💾 Saving session data...');
  await client.destroy();
  console.log('✅ WhatsApp session saved');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  await client.destroy();
  process.exit(0);
});

// Start server and WhatsApp client
app.listen(PORT, () => {
  console.log('\n🚀 EduTrack WhatsApp Bot Server Started!');
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log('📱 Initializing WhatsApp client...');
  console.log('⏳ Please wait for QR code to appear...\n');
  
  client.initialize();
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});