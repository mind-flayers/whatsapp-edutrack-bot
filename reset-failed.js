const admin = require("firebase-admin");
const serviceAccount = require("./service-account-key.json");
admin.initializeApp({credential: admin.credential.cert(serviceAccount)});
const db = admin.firestore();
(async () => {
  const admins = await db.collection("admins").listDocuments();
  let total = 0;
  for (const adminDoc of admins) {
    const failed = await db.collection("admins").doc(adminDoc.id).collection("whatsappQueue").where("status", "==", "failed").get();
    for (const doc of failed.docs) {
      await doc.ref.update({status: "pending", attempts: 0, updatedAt: admin.firestore.FieldValue.serverTimestamp()});
      console.log(`Reset ${doc.id} to pending`);
      total++;
    }
  }
  console.log(`\nTotal reset: ${total} messages`);
  process.exit(0);
})();
