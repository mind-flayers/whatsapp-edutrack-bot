/**
 * PM2 Ecosystem Configuration for EduTrack WhatsApp Bot
 * 
 * This file configures PM2 process manager to run the WhatsApp bot
 * and Firebase bridge services 24/7 with automatic restart on failure.
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 status
 *   pm2 logs
 *   pm2 restart all
 *   pm2 stop all
 * 
 * Documentation: https://pm2.keymetrics.io/docs/usage/application-declaration/
 */

module.exports = {
  apps: [
    {
      // WhatsApp Bot Application
      name: 'whatsapp-bot',
      script: 'server-baileys.js',
      
      // Process Configuration
      instances: 1,
      exec_mode: 'fork',
      
      // Auto-restart Configuration
      autorestart: true,
      watch: false, // Set to true only in development
      max_memory_restart: '500M', // Restart if memory exceeds 500MB
      
      // Restart Strategy
      min_uptime: '10s', // Consider app online after 10s
      max_restarts: 10, // Max restarts within 1 minute
      restart_delay: 4000, // Wait 4s before restart
      
      // Environment Variables
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      
      // Logging Configuration
      error_file: 'logs/whatsapp-bot-error.log',
      out_file: 'logs/whatsapp-bot-output.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
      
      // Advanced Options
      kill_timeout: 5000, // Time to wait for graceful shutdown
      listen_timeout: 10000, // Time to wait for app to be ready
      
      // Additional Metadata
      cwd: './', // Current working directory
      node_args: '--max-old-space-size=512', // Node.js memory limit
    },
    
    {
      // Firebase Bridge Application
      name: 'firebase-bridge',
      script: 'firebase-bridge.js',
      
      // Process Configuration
      instances: 1,
      exec_mode: 'fork',
      
      // Auto-restart Configuration
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      
      // Restart Strategy
      min_uptime: '10s',
      max_restarts: 10,
      restart_delay: 4000,
      
      // Environment Variables
      env: {
        NODE_ENV: 'production'
      },
      
      // Logging Configuration
      error_file: 'logs/firebase-bridge-error.log',
      out_file: 'logs/firebase-bridge-output.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
      
      // Advanced Options
      kill_timeout: 5000,
      listen_timeout: 10000,
      
      // Additional Metadata
      cwd: './',
      node_args: '--max-old-space-size=256',
    }
  ],
  
  // Deployment Configuration (Optional)
  deploy: {
    production: {
      user: 'ubuntu',
      host: 'YOUR_ORACLE_CLOUD_IP',
      ref: 'origin/main',
      repo: 'https://github.com/mind-flayers/edu-track.git',
      path: '/home/ubuntu/edu-track',
      'post-deploy': 'cd whatsapp-edutrack-bot && npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};
