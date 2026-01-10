const { spawn } = require('child_process');
const http = require('http');

console.log('🚀 EduTrack WhatsApp Service Starting...');
console.log('📦 Starting combined bot + bridge service\n');

// Store process references
let botProcess = null;
let bridgeProcess = null;

// Function to start the WhatsApp bot
function startBot() {
    console.log('🤖 Starting WhatsApp Bot (server-baileys.js)...');

    botProcess = spawn('node', ['server-baileys.js'], {
        env: { ...process.env },
        stdio: 'pipe'
    });

    botProcess.stdout.on('data', (data) => {
        process.stdout.write(`[BOT] ${data}`);
    });

    botProcess.stderr.on('data', (data) => {
        process.stderr.write(`[BOT ERROR] ${data}`);
    });

    botProcess.on('close', (code) => {
        console.log(`❌ Bot process exited with code ${code}`);
        // Auto-restart bot after 5 seconds
        setTimeout(() => {
            console.log('🔄 Restarting bot...');
            startBot();
        }, 5000);
    });
}

// Function to start the Firebase bridge
function startBridge() {
    // Wait 10 seconds for bot to start first
    setTimeout(() => {
        console.log('🌉 Starting Firebase Bridge (firebase-bridge.js)...');

        bridgeProcess = spawn('node', ['firebase-bridge.js'], {
            env: { ...process.env },
            stdio: 'pipe'
        });

        bridgeProcess.stdout.on('data', (data) => {
            process.stdout.write(`[BRIDGE] ${data}`);
        });

        bridgeProcess.stderr.on('data', (data) => {
            process.stderr.write(`[BRIDGE ERROR] ${data}`);
        });

        bridgeProcess.on('close', (code) => {
            console.log(`❌ Bridge process exited with code ${code}`);
            // Auto-restart bridge after 5 seconds
            setTimeout(() => {
                console.log('🔄 Restarting bridge...');
                startBridge();
            }, 5000);
        });
    }, 10000); // 10 second delay
}

// Health check server (for Render + cron-job.org)
const healthServer = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            service: 'edutrack-whatsapp',
            bot: botProcess ? 'running' : 'stopped',
            bridge: bridgeProcess ? 'running' : 'stopped',
            timestamp: new Date().toISOString()
        }));
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

// Use PORT from environment (Render provides this)
const PORT = process.env.PORT || 3001;
healthServer.listen(PORT, () => {
    console.log(`✅ Health check server running on port ${PORT}`);
    console.log(`🔗 Health endpoint: http://localhost:${PORT}/health\n`);
});

// Start both processes
startBot();
startBridge();

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');

    if (botProcess) botProcess.kill();
    if (bridgeProcess) bridgeProcess.kill();

    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down...');

    if (botProcess) botProcess.kill();
    if (bridgeProcess) bridgeProcess.kill();

    process.exit(0);
});
