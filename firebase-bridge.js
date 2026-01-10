const WHATSAPP_BOT_URL = 'http://localhost:3000'; // Your WhatsApp bot server
const BATCH_SIZE = 10;
const RETRY_DELAY = 5000; // 5 seconds
const MAX_RETRIES = 3;

console.log('🚀 WhatsApp Firebase Bridge Started');
console.log(`📡 Monitoring Firestore for queued messages...`);
console.log(`🤖 WhatsApp Bot URL: ${WHATSAPP_BOT_URL}`);

// Function to send message to WhatsApp bot
async function sendToWhatsAppBot(recipientNumber, message) {
  try {
    // Format phone number to international format
    let formattedNumber = recipientNumber;

    // Remove + and any spaces/dashes
    formattedNumber = formattedNumber.replace(/[\s\-\+]/g, '');

    // Convert Sri Lankan local format to international format
    if (formattedNumber.startsWith('0')) {
      formattedNumber = '94' + formattedNumber.substring(1);
    }
    // If it doesn't start with country code, assume it's Sri Lankan
    else if (formattedNumber.length === 9 && !formattedNumber.startsWith('94')) {
      formattedNumber = '94' + formattedNumber;
    }
    // If already has 94, ensure no leading zeros
    else if (formattedNumber.startsWith('94')) {
      // Already correct format
    }

    console.log(`📱 Sending to: ${recipientNumber} → ${formattedNumber}`);

    const response = await axios.post(`${WHATSAPP_BOT_URL}/send-message`, {
      number: formattedNumber,  // Field name matches server-baileys.js expectation
      message: message
    }, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 200) {
      console.log(`✅ Message sent successfully to ${formattedNumber}`);
      return { success: true, data: response.data };
    } else {
      console.log(`⚠️ Unexpected response status: ${response.status}`);
      return { success: false, error: `HTTP ${response.status}` };
    }
  } catch (error) {
    console.log(`❌ Failed to send message to ${recipientNumber}:`, error.response?.data?.error || error.message);
    return { success: false, error: error.response?.data?.error || error.message };
  }
}

// Function to update message status in Firestore
async function updateMessageStatus(adminUid, messageId, status, error = null, attempts = 0) {
  try {
    const updateData = {
      status: status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      attempts: attempts
    };

    if (error) {
      updateData.errorMessage = error;
    }

    if (status === 'completed') {
      updateData.completedAt = admin.firestore.FieldValue.serverTimestamp();
    }

    await db
      .collection('admins')
      .doc(adminUid)
      .collection('whatsappQueue')
      .doc(messageId)
      .update(updateData);

    console.log(`📝 Updated message ${messageId} status to: ${status}`);
  } catch (error) {
    console.error(`❌ Error updating message status:`, error.message);
  }
}

// Function to process a single message
async function processMessage(adminUid, messageDoc) {
  const messageId = messageDoc.id;
  const data = messageDoc.data();

  // Handle different field names from your Flutter app
  const recipientNumber = data.recipientNumber || data.phone;
  const message = data.message;
  const attempts = data.attempts || data.retryCount || 0;
  const maxAttempts = data.maxAttempts || 3;

  // Check if bot is ready before attempting to send
  try {
    const healthCheck = await axios.get(`${WHATSAPP_BOT_URL}/health`, { timeout: 3000 });
    if (!healthCheck.data.whatsapp_ready) {
      console.log(`⚠️ Bot not ready, skipping message ${messageId} (will retry in next cycle)`);
      return; // Don't increment attempts, just skip this cycle
    }
  } catch (error) {
    console.log(`⚠️ Cannot reach bot, skipping message ${messageId} (will retry in next cycle)`);
    return; // Don't increment attempts, just skip this cycle
  }

  console.log(`📤 Processing message data:`, {
    messageId,
    adminUid,
    recipientNumber,
    messageType: data.messageType || data.type,
    status: data.status,
    attempts: attempts
  });

  if (!recipientNumber || !message) {
    console.log(`❌ Message ${messageId} missing required fields:`, {
      hasRecipientNumber: !!recipientNumber,
      hasMessage: !!message,
      rawData: data
    });
    await updateMessageStatus(adminUid, messageId, 'failed', 'Missing required fields', attempts + 1);
    return;
  }

  console.log(`📤 Processing message ${messageId} for ${recipientNumber} (attempt ${attempts + 1})`);

  // Update to processing status
  await updateMessageStatus(adminUid, messageId, 'processing', null, attempts + 1);

  // Send message to WhatsApp bot
  const result = await sendToWhatsAppBot(recipientNumber, message);

  if (result.success) {
    // Mark as completed
    console.log(`✅ Message ${messageId} sent successfully!`);
    await updateMessageStatus(adminUid, messageId, 'completed', null, attempts + 1);
  } else {
    const newAttempts = attempts + 1;

    if (newAttempts >= maxAttempts) {
      // Mark as failed after max retries
      console.log(`❌ Message ${messageId} failed permanently after ${newAttempts} attempts`);
      await updateMessageStatus(adminUid, messageId, 'failed', result.error, newAttempts);
    } else {
      // Mark as pending for retry
      console.log(`🔄 Message ${messageId} will be retried (${newAttempts}/${maxAttempts})`);
      await updateMessageStatus(adminUid, messageId, 'pending', result.error, newAttempts);
    }
  }
}

// Function to process pending messages for a specific admin
async function processPendingMessages(adminUid) {
  try {
    console.log(`🔍 Checking for pending messages for admin: ${adminUid}`);

    const pendingMessagesQuery = db
      .collection('admins')
      .doc(adminUid)
      .collection('whatsappQueue')
      .where('status', '==', 'pending')
      .limit(BATCH_SIZE);

    console.log(`📋 Querying: admins/${adminUid}/whatsappQueue (status=pending, limit=${BATCH_SIZE})`);

    const pendingMessages = await pendingMessagesQuery.get();

    if (pendingMessages.empty) {
      console.log(`📭 No pending messages found for admin ${adminUid}`);
      return;
    }

    console.log(`📋 Found ${pendingMessages.docs.length} pending messages for admin ${adminUid}`);

    // Process messages sequentially to avoid overwhelming the WhatsApp bot
    for (const messageDoc of pendingMessages.docs) {
      await processMessage(adminUid, messageDoc);

      // Small delay between messages
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

  } catch (error) {
    console.error(`❌ Error processing messages for admin ${adminUid}:`, error.message);
    console.error('Full error details:', error);
  }
}

// Function to get all admin UIDs dynamically
async function getAllAdminUids() {
  try {
    console.log('🔍 Searching for all admins in database...');

    // Get all admin documents
    const adminsSnapshot = await db.collection('admins').listDocuments();

    if (adminsSnapshot.length === 0) {
      console.log('⚠️ No admin documents found in database');
      return [];
    }

    console.log(`📋 Found ${adminsSnapshot.length} admin(s) in database`);

    // Extract admin UIDs
    const adminUids = adminsSnapshot.map(doc => doc.id);

    // Check which admins have pending messages
    const adminsWithPendingMessages = [];

    for (const adminUid of adminUids) {
      const pendingMessages = await db
        .collection('admins')
        .doc(adminUid)
        .collection('whatsappQueue')
        .where('status', '==', 'pending')
        .limit(1)
        .get();

      if (!pendingMessages.empty) {
        console.log(`✅ Admin ${adminUid} has pending messages`);
        adminsWithPendingMessages.push(adminUid);
      }
    }

    if (adminsWithPendingMessages.length === 0) {
      console.log('📭 No pending messages found for any admin');
      // Return all admins anyway so we can monitor them
      return adminUids;
    }

    return adminUids;
  } catch (error) {
    console.error('❌ Error getting admin UIDs:', error.message);
    return [];
  }
}

// Main processing loop
async function processAllMessages() {
  const adminUids = await getAllAdminUids();

  if (adminUids.length === 0) {
    console.log('⚠️ No admins found in database');
    return;
  }

  console.log(`👥 Processing messages for ${adminUids.length} admin(s)`);

  for (const adminUid of adminUids) {
    await processPendingMessages(adminUid);
  }
}

// Check WhatsApp bot health
async function checkBotHealth() {
  try {
    console.log('🔍 Attempting to connect to WhatsApp bot...');
    const response = await axios.get(`${WHATSAPP_BOT_URL}/health`, {
      timeout: 10000,
      headers: {
        'Connection': 'keep-alive',
        'User-Agent': 'Firebase-Bridge/1.0.0'
      },
      maxRedirects: 0,
      validateStatus: function (status) {
        return status >= 200 && status < 300;
      }
    });

    if (response.status === 200) {
      const botStatus = response.data;
      console.log('🤖 WhatsApp bot is healthy');
      console.log(`📊 Bot Status: ${JSON.stringify(botStatus, null, 2)}`);

      // Check if WhatsApp is actually ready
      if (botStatus.whatsapp_ready === true) {
        console.log('✅ WhatsApp Web is connected and ready');
        return true;
      } else {
        console.log('⚠️ Bot is online but WhatsApp Web not ready yet');
        console.log('💡 Wait for WhatsApp to authenticate and load');
        return false;
      }
    } else {
      console.log(`⚠️ Unexpected status code: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log('⚠️ WhatsApp bot health check failed:', error.message);
    console.log('🔍 Error details:', {
      code: error.code,
      errno: error.errno,
      syscall: error.syscall,
      address: error.address,
      port: error.port
    });
    return false;
  }
}

// Startup function
async function startup() {
  console.log('🔍 Checking WhatsApp bot connection...');

  // Try multiple times with delays
  let isHealthy = false;
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`🔄 Connection attempt ${attempt}/${maxAttempts}...`);
    isHealthy = await checkBotHealth();

    if (isHealthy) {
      break;
    }

    if (attempt < maxAttempts) {
      console.log('⏳ Waiting 3 seconds before retry...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  if (!isHealthy) {
    console.log('❌ WhatsApp bot is not ready after multiple attempts.');
    console.log('💡 Make sure WhatsApp bot is running AND WhatsApp Web is authenticated');
    console.log('📋 Try these steps:');
    console.log('   1. Check if npm start is running in another terminal');
    console.log('   2. Verify bot shows "✅ WhatsApp Client is ready!"');
    console.log('   3. If stuck on "authenticated", wait up to 60 seconds for "ready" event');
    console.log('   4. Test manually: http://localhost:3000/health');
    console.log('\n⚠️ CONTINUING ANYWAY - Messages will queue until bot is ready');
    console.log('🔄 Bridge will keep trying to send messages...\n');
    // Don't exit - just continue monitoring
  } else {
    console.log('✅ WhatsApp bot is ready and connected');
  }

  console.log('🔄 Starting message processing loop...');
}

// Function to reset failed messages when bot becomes ready
async function resetFailedMessages() {
  try {
    console.log('🔄 Resetting failed messages to pending...');
    const adminUids = await getAllAdminUids();

    let totalReset = 0;
    for (const adminUid of adminUids) {
      const failedMessages = await db
        .collection('admins')
        .doc(adminUid)
        .collection('whatsappQueue')
        .where('status', '==', 'failed')
        .where('attempts', '<', 5) // Only reset if less than 5 total attempts
        .get();

      for (const doc of failedMessages.docs) {
        await doc.ref.update({
          status: 'pending',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        totalReset++;
      }
    }

    if (totalReset > 0) {
      console.log(`✅ Reset ${totalReset} failed message(s) to pending`);
    }
  } catch (error) {
    console.error('❌ Error resetting failed messages:', error.message);
  }
}

// Main execution
startup().then(() => {
  let lastBotStatus = false;

  // Process messages every 10 seconds
  setInterval(async () => {
    try {
      // Check bot status
      let currentBotStatus = false;
      try {
        const healthCheck = await axios.get(`${WHATSAPP_BOT_URL}/health`, { timeout: 3000 });
        currentBotStatus = healthCheck.data.whatsapp_ready;
      } catch (error) {
        // Bot not reachable
      }

      // If bot just became ready, reset failed messages
      if (currentBotStatus && !lastBotStatus) {
        console.log('🎉 WhatsApp bot is now ready! Resetting failed messages...');
        await resetFailedMessages();
      }

      lastBotStatus = currentBotStatus;

      // Process messages
      await processAllMessages();
    } catch (error) {
      console.error('❌ Error in main processing loop:', error.message);
    }
  }, 10000);

  console.log('🎯 Firebase WhatsApp Bridge is now monitoring for messages every 10 seconds');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down Firebase WhatsApp Bridge...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down Firebase WhatsApp Bridge...');
  process.exit(0);
});