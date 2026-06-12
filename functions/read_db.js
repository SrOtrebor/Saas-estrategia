const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

async function read() {
  const db = admin.firestore();
  const snap = await db.collection('marcas').get();
  snap.forEach(doc => {
    console.log(`Marca ID: ${doc.id}`);
    console.log(`google_sheet_id: ${doc.data().google_sheet_id}`);
  });
}
read();
