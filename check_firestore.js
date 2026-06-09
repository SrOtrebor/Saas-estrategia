const admin = require('firebase-admin');
const serviceAccount = require('./functions/keys/serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function check() {
  const snapshot = await db.collection('planificador_contenido')
    .orderBy('created_at', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) {
    console.log('No posts found');
    return;
  }

  const data = snapshot.docs[0].data();
  console.log(JSON.stringify(data.contenido_generado.textos_capas_graficas, null, 2));
}

check().catch(console.error);
