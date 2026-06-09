const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.join(__dirname, "saas-estrategias-firebase-adminsdk-fbsvc-5a88c4b7c1.json"));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function checkColors() {
  const marcas = await db.collection("marcas").get();
  marcas.forEach(doc => {
    console.log("Marca:", doc.id);
    console.log("Colores:", doc.data().identidad_visual);
  });
  process.exit(0);
}

checkColors();
