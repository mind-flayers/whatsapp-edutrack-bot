const admin = require('firebase-admin');
const fs = require('fs').promises;
const path = require('path');

class FirebaseStorageSync {
  constructor(bucketName) {
    this.bucket = admin.storage().bucket(bucketName);
    this.localAuthPath = './auth_info';
    this.remoteAuthPath = 'whatsapp-sessions/main'; // Storage path
  }

  /**
   * Upload entire auth_info folder to Firebase Storage
   */
  async uploadAuthInfo() {
    try {
      console.log('📤 Uploading auth_info to Firebase Storage...');
      
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

      // Upload each file
      let uploadCount = 0;
      for (const file of files) {
        const localFilePath = path.join(this.localAuthPath, file);
        const remoteFilePath = `${this.remoteAuthPath}/${file}`;
        
        try {
          const stats = await fs.stat(localFilePath);
          if (stats.isFile()) {
            await this.bucket.upload(localFilePath, {
              destination: remoteFilePath,
              metadata: {
                contentType: 'application/json',
                metadata: {
                  uploadedAt: new Date().toISOString()
                }
              }
            });
            uploadCount++;
          }
        } catch (error) {
          console.error(`❌ Failed to upload ${file}:`, error.message);
        }
      }

      console.log(`✅ Uploaded ${uploadCount} files to Firebase Storage`);
      return true;
    } catch (error) {
      console.error('❌ Upload failed:', error.message);
      return false;
    }
  }

  /**
   * Download entire auth_info folder from Firebase Storage
   */
  async downloadAuthInfo() {
    try {
      console.log('📥 Downloading auth_info from Firebase Storage...');

      // Create local auth_info directory if it doesn't exist
      try {
        await fs.access(this.localAuthPath);
      } catch {
        await fs.mkdir(this.localAuthPath, { recursive: true });
        console.log('📁 Created local auth_info directory');
      }

      // List all files in remote auth_info
      const [files] = await this.bucket.getFiles({
        prefix: `${this.remoteAuthPath}/`
      });

      if (files.length === 0) {
        console.log('⚠️ No session files found in Firebase Storage');
        return false;
      }

      // Download each file
      let downloadCount = 0;
      for (const file of files) {
        const fileName = path.basename(file.name);
        const localFilePath = path.join(this.localAuthPath, fileName);
        
        try {
          await file.download({ destination: localFilePath });
          downloadCount++;
        } catch (error) {
          console.error(`❌ Failed to download ${fileName}:`, error.message);
        }
      }

      console.log(`✅ Downloaded ${downloadCount} files from Firebase Storage`);
      return downloadCount > 0;
    } catch (error) {
      console.error('❌ Download failed:', error.message);
      return false;
    }
  }

  /**
   * Check if auth_info exists in Firebase Storage
   */
  async hasRemoteSession() {
    try {
      const [files] = await this.bucket.getFiles({
        prefix: `${this.remoteAuthPath}/`,
        maxResults: 1
      });
      return files.length > 0;
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
      const [files] = await this.bucket.getFiles({
        prefix: `${this.remoteAuthPath}/`
      });

      for (const file of files) {
        await file.delete();
      }

      console.log('✅ Remote session cleared');
      return true;
    } catch (error) {
      console.error('❌ Failed to clear remote session:', error.message);
      return false;
    }
  }
}

module.exports = FirebaseStorageSync;
