const admin = require('firebase-admin');
const fs = require('fs').promises;
const path = require('path');

/**
 * FirestoreSessionSync - Store WhatsApp session files in Firestore documents
 * This is a FREE alternative to Firebase Storage since Firestore has generous free tier:
 * - 50,000 reads/day (we'll use ~10-20 reads/day)
 * - 20,000 writes/day (we'll use ~5-10 writes/day)
 * - 1 GiB storage (session files are < 5 MB total)
 * - No pausing or inactivity limits
 */
class FirestoreSessionSync {
  constructor() {
    this.db = admin.firestore();
    this.localAuthPath = './auth_info';
    // Store sessions in: whatsappSessions/main/files/{filename}
    this.sessionsCollection = 'whatsappSessions';
    this.sessionDoc = 'main';
    this.filesCollection = 'files';
  }

  /**
   * Upload entire auth_info folder to Firestore as documents
   */
  async uploadAuthInfo() {
    try {
      console.log('📤 Uploading auth_info to Firestore...');
      
      // Check if local auth_info exists
      try {
        await fs.access(this.localAuthPath);
      } catch {
        console.log('⚠️ No local auth_info folder found, skipping upload');
        return false;
      }

      // Read all files in auth_info
      const files = await fs.readdir(this.localAuthPath);
      
      if (files.length === 0) {
        console.log('⚠️ auth_info folder is empty, skipping upload');
        return false;
      }

      // Upload each file as a Firestore document
      const batch = this.db.batch();
      let uploadCount = 0;

      for (const fileName of files) {
        const localFilePath = path.join(this.localAuthPath, fileName);
        
        try {
          const stats = await fs.stat(localFilePath);
          if (stats.isFile()) {
            // Read file content
            const fileContent = await fs.readFile(localFilePath, 'utf8');
            
            // Store in Firestore: whatsappSessions/main/files/{filename}
            const docRef = this.db
              .collection(this.sessionsCollection)
              .doc(this.sessionDoc)
              .collection(this.filesCollection)
              .doc(fileName);
            
            batch.set(docRef, {
              content: fileContent,
              fileName: fileName,
              uploadedAt: admin.firestore.FieldValue.serverTimestamp(),
              size: stats.size
            });
            
            uploadCount++;
          }
        } catch (error) {
          console.error(`❌ Failed to upload ${fileName}:`, error.message);
        }
      }

      // Commit batch
      if (uploadCount > 0) {
        await batch.commit();
        console.log(`✅ Uploaded ${uploadCount} files to Firestore`);
      }

      return uploadCount > 0;
    } catch (error) {
      console.error('❌ Upload failed:', error.message);
      return false;
    }
  }

  /**
   * Download entire auth_info folder from Firestore documents
   */
  async downloadAuthInfo() {
    try {
      console.log('📥 Downloading auth_info from Firestore...');

      // Create local auth_info directory if it doesn't exist
      try {
        await fs.access(this.localAuthPath);
      } catch {
        await fs.mkdir(this.localAuthPath, { recursive: true });
        console.log('📁 Created local auth_info directory');
      }

      // Get all file documents from Firestore
      const filesSnapshot = await this.db
        .collection(this.sessionsCollection)
        .doc(this.sessionDoc)
        .collection(this.filesCollection)
        .get();

      if (filesSnapshot.empty) {
        console.log('⚠️ No session files found in Firestore');
        return false;
      }

      // Download each file
      let downloadCount = 0;
      for (const doc of filesSnapshot.docs) {
        const data = doc.data();
        const fileName = doc.id;
        const fileContent = data.content;
        const localFilePath = path.join(this.localAuthPath, fileName);
        
        try {
          await fs.writeFile(localFilePath, fileContent, 'utf8');
          downloadCount++;
        } catch (error) {
          console.error(`❌ Failed to download ${fileName}:`, error.message);
        }
      }

      console.log(`✅ Downloaded ${downloadCount} files from Firestore`);
      return downloadCount > 0;
    } catch (error) {
      console.error('❌ Download failed:', error.message);
      return false;
    }
  }

  /**
   * Check if auth_info exists in Firestore
   */
  async hasRemoteSession() {
    try {
      const filesSnapshot = await this.db
        .collection(this.sessionsCollection)
        .doc(this.sessionDoc)
        .collection(this.filesCollection)
        .limit(1)
        .get();
      
      return !filesSnapshot.empty;
    } catch (error) {
      console.error('❌ Failed to check remote session:', error.message);
      return false;
    }
  }

  /**
   * Delete all files in remote auth_info (for logout/reset)
   */
  async clearRemoteSession() {
    try {
      console.log('🗑️ Clearing remote session...');
      
      const filesSnapshot = await this.db
        .collection(this.sessionsCollection)
        .doc(this.sessionDoc)
        .collection(this.filesCollection)
        .get();

      if (filesSnapshot.empty) {
        console.log('✅ No session files to clear');
        return true;
      }

      // Delete all documents in batch
      const batch = this.db.batch();
      filesSnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      console.log(`✅ Cleared ${filesSnapshot.size} session files from Firestore`);
      return true;
    } catch (error) {
      console.error('❌ Failed to clear remote session:', error.message);
      return false;
    }
  }

  /**
   * Get session metadata (file count, last upload time, total size)
   */
  async getSessionMetadata() {
    try {
      const filesSnapshot = await this.db
        .collection(this.sessionsCollection)
        .doc(this.sessionDoc)
        .collection(this.filesCollection)
        .get();

      if (filesSnapshot.empty) {
        return null;
      }

      const files = filesSnapshot.docs.map(doc => doc.data());
      const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);
      const lastUpload = files.reduce((latest, file) => {
        if (!file.uploadedAt) return latest;
        const uploadTime = file.uploadedAt.toDate();
        return !latest || uploadTime > latest ? uploadTime : latest;
      }, null);

      return {
        fileCount: files.length,
        totalSize: totalSize,
        lastUpload: lastUpload,
        files: files.map(f => ({ name: f.fileName, size: f.size }))
      };
    } catch (error) {
      console.error('❌ Failed to get session metadata:', error.message);
      return null;
    }
  }
}

module.exports = FirestoreSessionSync;
