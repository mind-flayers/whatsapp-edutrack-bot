# WhatsApp EduTrack Bot

Automated WhatsApp notification bot for EduTrack Academy Management System. Sends attendance updates, fee reminders, and exam results to parents via WhatsApp.

## ✅ Features

- 📱 Automated WhatsApp notifications to parents
- 🔄 Message queue with retry mechanism
- 💾 Session persistence via Firebase Storage
- 🌐 Free 24/7 hosting on Render.com
- ⚡ Real-time status tracking in Firestore

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Render.com Free Tier                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │        Combined Web Service (start.js)               │   │
│  │  ├── server-baileys.js (WhatsApp Bot)               │   │
│  │  │   - Connects to WhatsApp Web                     │   │
│  │  │   - Syncs auth_info to Firebase Storage          │   │
│  │  └── firebase-bridge.js (Queue Monitor)             │   │
│  │      - Polls Firestore every 10s                    │   │
│  │      - Forwards messages to bot                     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
               │                        │
               ▼                        ▼
    ┌──────────────────┐      ┌──────────────────────┐
    │   Cron-job.org   │      │   Firebase Storage   │
    │   Pings /health  │      │   Session backup     │
    │   every 12 min   │      │   (auth_info/)       │
    └──────────────────┘      └──────────────────────┘
```

**Message Flow:**
```
Flutter App → Firebase Firestore → Firebase Bridge → WhatsApp Bot → WhatsApp Web → Parent
```

---

## 📋 Prerequisites

- Node.js 18+
- Firebase project with Firestore and Storage enabled
- GitHub account (for Render deployment)
- Render.com account (free)
- Cron-job.org account (free)

---

## 🚀 Local Development Setup

### Step 1: Install Dependencies

```bash
cd whatsapp-edutrack-bot
npm install
```

### Step 2: Get Firebase Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/) → Your Project
2. Project Settings → Service Accounts
3. Click "Generate new private key"
4. Rename downloaded file to `service-account-key.json`
5. Place in `whatsapp-edutrack-bot/` folder

### Step 3: Start the Bot (Terminal 1)

```bash
npm start
```

- Scan QR code with WhatsApp → Linked Devices → Link a Device
- Wait for "✅ WhatsApp connected successfully!"

### Step 4: Start Firebase Bridge (Terminal 2)

```bash
npm run bridge
```

### Step 5: Test

1. Open Flutter app → Mark attendance for a student
2. Check Firestore → `admins/{uid}/whatsappQueue` for message
3. Verify WhatsApp message received by parent

---

## ☁️ Production Deployment (Render.com)

### Step 1: Enable Firebase Storage

1. Go to Firebase Console → Storage → Get Started
2. Select production mode
3. Choose location (e.g., `asia-southeast1`)
4. Update Storage Rules:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /whatsapp-sessions/{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### Step 2: Push Code to GitHub

```bash
cd whatsapp-edutrack-bot
git init
git add .
git commit -m "WhatsApp bot for Render deployment"
git remote add origin https://github.com/YOUR_USERNAME/edutrack-whatsapp-bot.git
git push -u origin main
```

### Step 3: Create Render Web Service

1. Go to [render.com](https://render.com/) → Sign up with GitHub
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Name**: `edutrack-whatsapp-bot`
   - **Region**: Singapore (or closest)
   - **Branch**: `main`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free

### Step 4: Add Environment Variables

In Render Dashboard → Environment:

```bash
NODE_ENV=production
PORT=10000
FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"..."}
```

**To get service account as single line:**
```bash
cat service-account-key.json | tr -d '\n' | tr -s ' '
```

### Step 5: Deploy

1. Click "Create Web Service"
2. Wait for deployment (5-10 minutes)
3. Check logs for QR code
4. Scan QR with WhatsApp
5. Session auto-saves to Firebase Storage

### Step 6: Setup Keep-Alive (Cron-job.org)

Render free tier sleeps after 15 min of inactivity. Use cron-job.org to keep it awake:

1. Go to [cron-job.org](https://cron-job.org/) → Create free account
2. Create new cronjob:
   - **Title**: `EduTrack WhatsApp Keep-Alive`
   - **URL**: `https://your-app.onrender.com/health`
   - **Schedule**: Every 12 minutes (`*/12 * * * *`)
3. Enable email notifications on failure

---

## 📁 Project Structure

```
whatsapp-edutrack-bot/
├── server-baileys.js       # WhatsApp bot server (Baileys)
├── firebase-bridge.js      # Firestore queue monitor
├── firebase-storage-sync.js # Session sync to Firebase Storage
├── start.js                # Combined launcher for Render
├── package.json            # Dependencies and scripts
├── .gitignore              # Ignore node_modules, auth_info, secrets
└── service-account-key.json # Firebase Admin SDK (DO NOT COMMIT)
```

## 📊 Firestore Collection Structure

```
admins/
  └── {adminUid}/
      └── whatsappQueue/
          └── {messageId}/
              ├── recipientNumber: "+94771234567"
              ├── message: "📚 Attendance Update..."
              ├── messageType: "attendance" | "fee" | "exam"
              ├── status: "pending" | "processing" | "completed" | "failed"
              ├── attempts: 0
              ├── maxAttempts: 3
              ├── createdAt: Timestamp
              ├── updatedAt: Timestamp
              └── metadata: { studentName, subject, ... }
```

**Status Flow**: `pending` → `processing` → `completed` or `failed`

---

## 🔧 Troubleshooting

### Bot not connecting to WhatsApp

```bash
# Check health endpoint
curl http://localhost:3000/health

# Delete auth_info and re-scan QR
rm -rf auth_info/
npm start
```

### Messages stuck in "pending"

1. Check Firebase Bridge is running: `npm run bridge`
2. Verify bot health: `curl http://localhost:3000/health`
3. Check Firestore rules allow read/write

### Session lost after Render restart

1. Verify Firebase Storage is enabled
2. Check `FIREBASE_STORAGE_BUCKET` env var is correct
3. Look for "📥 Downloading session from Firebase Storage..." in logs

### Render service sleeping

1. Verify cron-job.org is pinging `/health` every 12 minutes
2. Check cron-job execution history for failures
3. Ensure URL is correct: `https://your-app.onrender.com/health`

### Out of memory on Render

Render free tier has 512MB limit. If crashing:

1. Check for memory leaks in logs
2. Reduce polling interval in firebase-bridge.js
3. Restart service to clear memory

---

## 💰 Cost Breakdown

| Service | Free Tier | Usage | Cost |
|---------|-----------|-------|------|
| Render.com | 750 hrs/month | 24/7 service | $0 |
| Firebase Storage | 5GB | ~1MB sessions | $0 |
| Firebase Firestore | 50K reads/day | ~2K/day | $0 |
| Cron-job.org | 50 jobs | 1 job | $0 |
| **Total** | | | **$0/month** |

---

## 🔒 Security

- ❌ Never commit `service-account-key.json` to Git
- ❌ Never commit `auth_info/` folder
- ✅ Use environment variables on Render
- ✅ Keep Firebase Storage rules restrictive
- ✅ Use `.gitignore` properly

---

## 📜 Scripts

```bash
npm start       # Start bot server (server-baileys.js)
npm run bridge  # Start Firebase bridge (firebase-bridge.js)
npm run dev     # Start combined service (start.js) - for Render
```

---

## ✨ Benefits

- ✅ **Free Forever**: $0/month with all free tiers
- ✅ **No Server Management**: Render handles everything
- ✅ **Auto-Recovery**: Session persists in Firebase Storage
- ✅ **Scalable**: Handles 100+ students easily
- ✅ **Reliable**: Built-in retry mechanism