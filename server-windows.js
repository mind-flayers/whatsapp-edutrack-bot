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
app.use(express.json());

// Global variables
let clientReady = false;
let qrString = '';

// WhatsApp Client Setup with enhanced Windows compatibility
const client = new Client({
    authStrategy: new LocalAuth({ 
        clientId: 'edutrack-bot-win'
    }),
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding'
        ],
        headless: true,
        timeout: 120000
    }
});

// Event handlers
client.on('qr', (qr) => {
    console.log('📱 QR Code received! Please scan with your WhatsApp:');
    qrcode.generate(qr, { small: true });
    qrString = qr;
    console.log('\n🔗 QR Code ready for scanning');
});

client.on('ready', () => {
    console.log('✅ WhatsApp Client is ready!');
    clientReady = true;
});

client.on('authenticated', () => {
    console.log('🔐 WhatsApp Client authenticated successfully!');
});

client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failed:', msg);
    clientReady = false;
});

client.on('disconnected', (reason) => {
    console.log('📱 WhatsApp client disconnected:', reason);
    clientReady = false;
    
    // Don't auto-restart, let user manually restart
    console.log('💡 Please restart the server to reconnect');
});

// API Routes
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        whatsapp_ready: clientReady,
        timestamp: new Date().toISOString(),
        message: clientReady ? 'WhatsApp is connected and ready' : 'WhatsApp is not ready'
    });
});

app.get('/status', (req, res) => {
    res.json({
        authenticated: clientReady,
        qr_available: !clientReady && qrString !== '',
        needs_qr_scan: !clientReady,
        timestamp: new Date().toISOString()
    });
});

app.post('/send-message', async (req, res) => {
    try {
        if (!clientReady) {
            return res.status(503).json({
                success: false,
                error: 'WhatsApp client is not ready. Please wait for authentication.'
            });
        }

        const { phone, message } = req.body;
        
        if (!phone || !message) {
            return res.status(400).json({
                success: false,
                error: 'Phone number and message are required'
            });
        }

        // Format phone number (remove + and ensure country code)
        const formattedPhone = phone.replace(/[^\d]/g, '') + '@c.us';
        
        console.log(`📤 Sending message to ${phone}:`, message);
        
        // Send message
        await client.sendMessage(formattedPhone, message);
        
        console.log('✅ Message sent successfully!');
        
        res.json({
            success: true,
            message: 'Message sent successfully',
            to: phone,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error sending message:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send message: ' + error.message
        });
    }
});

// Attendance notification endpoint
app.post('/notify/attendance', async (req, res) => {
    try {
        if (!clientReady) {
            return res.status(503).json({
                success: false,
                error: 'WhatsApp client is not ready'
            });
        }

        const { studentName, subject, phone, date, time } = req.body;
        
        if (!studentName || !subject || !phone) {
            return res.status(400).json({
                success: false,
                error: 'Student name, subject, and phone number are required'
            });
        }

        const message = `✅ *EduTrack Attendance Alert*

👤 Student: *${studentName}*
📚 Subject: *${subject}*
📅 Date: ${date || new Date().toLocaleDateString()}
🕐 Time: ${time || new Date().toLocaleTimeString()}

Your child's attendance has been marked successfully.

---
EduTrack Management System`;

        const formattedPhone = phone.replace(/[^\d]/g, '') + '@c.us';
        
        await client.sendMessage(formattedPhone, message);
        
        console.log(`✅ Attendance notification sent to ${phone} for ${studentName}`);
        
        res.json({
            success: true,
            message: 'Attendance notification sent successfully'
        });

    } catch (error) {
        console.error('❌ Error sending attendance notification:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send notification: ' + error.message
        });
    }
});

// Payment notification endpoint
app.post('/notify/payment', async (req, res) => {
    try {
        if (!clientReady) {
            return res.status(503).json({
                success: false,
                error: 'WhatsApp client is not ready'
            });
        }

        const { studentName, amount, phone, date } = req.body;
        
        if (!studentName || !amount || !phone) {
            return res.status(400).json({
                success: false,
                error: 'Student name, amount, and phone number are required'
            });
        }

        const message = `💰 *EduTrack Payment Confirmation*

👤 Student: *${studentName}*
💵 Amount: *Rs. ${amount}*
📅 Date: ${date || new Date().toLocaleDateString()}

Payment has been received and recorded successfully.
Thank you for your payment!

---
EduTrack Management System`;

        const formattedPhone = phone.replace(/[^\d]/g, '') + '@c.us';
        
        await client.sendMessage(formattedPhone, message);
        
        console.log(`✅ Payment notification sent to ${phone} for ${studentName}`);
        
        res.json({
            success: true,
            message: 'Payment notification sent successfully'
        });

    } catch (error) {
        console.error('❌ Error sending payment notification:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send notification: ' + error.message
        });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Express error:', error);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// Start server first, then initialize WhatsApp client
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('\n🚀 EduTrack WhatsApp Bot Server Started!');
    console.log(`📡 Server running on http://0.0.0.0:${PORT}`);
    console.log(`📱 Access from network: http://192.168.8.144:${PORT}`);
    console.log('📱 Initializing WhatsApp client...');
    console.log('⏳ Please wait for QR code to appear...\n');
});

// Graceful shutdown with enhanced Windows cleanup
const gracefulShutdown = async (signal) => {
    console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
    
    // Close server first
    server.close(() => {
        console.log('🔌 HTTP server closed');
    });
    
    // Destroy WhatsApp client
    try {
        if (client) {
            console.log('💾 Destroying WhatsApp client...');
            await client.destroy();
            console.log('✅ WhatsApp client destroyed');
        }
    } catch (error) {
        console.log('⚠️ Error during client cleanup:', error.message);
    }
    
    // Force exit after timeout (Windows file lock workaround)
    setTimeout(() => {
        console.log('🔄 Force exit...');
        process.exit(0);
    }, 3000);
};

// Handle shutdown signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));

// Enhanced error handling
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error.message);
    if (error.code !== 'EBUSY') {
        process.exit(1);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise);
    console.error('❌ Reason:', reason?.message || reason);
    
    // Don't exit on file lock errors
    if (reason?.message?.includes('EBUSY') || reason?.message?.includes('lockfile')) {
        console.log('🔄 Continuing despite file lock error...');
        return;
    }
});

// Initialize WhatsApp client after server starts
setTimeout(() => {
    try {
        client.initialize();
    } catch (error) {
        console.error('❌ Failed to initialize WhatsApp client:', error.message);
    }
}, 1000);