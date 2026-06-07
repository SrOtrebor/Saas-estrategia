const admin = require("firebase-admin");
admin.initializeApp();

async function clear() {
  const db = admin.firestore();
  const snap = await db.collection("sesiones_bot").get();
  const batch = db.batch();
  snap.docs.forEach(doc => {
    batch.update(doc.ref, { historia: [] });
  });
  await batch.commit();
  console.log("Historial borrado para", snap.size, "sesiones.");
}

clear().then(() => process.exit(0)).catch(console.error);
