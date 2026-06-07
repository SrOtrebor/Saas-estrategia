const admin = require('firebase-admin');
const fs = require('fs');

const serviceAccount = require('./firebase.json'); // I might need the exact path or use default credentials

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  storageBucket: "saas-estrategias.appspot.com"
});

async function downloadLatestImage() {
  const bucket = admin.storage().bucket();
  const [files] = await bucket.getFiles({ prefix: 'posts/marca_demo/' });
  
  if (files.length === 0) {
    console.log("No files found.");
    return;
  }
  
  // Sort by updated time
  files.sort((a, b) => new Date(b.metadata.updated) - new Date(a.metadata.updated));
  
  const latestFile = files[0];
  console.log(`Downloading latest file: ${latestFile.name}`);
  
  const destPath = require('path').join(__dirname, 'latest_slide.jpg');
  await latestFile.download({ destination: destPath });
  console.log("Download complete: " + destPath);
}

downloadLatestImage().catch(console.error);
