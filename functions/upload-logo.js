const admin = require("./node_modules/firebase-admin");
const cert = require("../saas-estrategias-firebase-adminsdk-fbsvc-5a88c4b7c1.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(cert),
    storageBucket: "saas-estrategias.firebasestorage.app",
  });
}

const bucket = admin.storage().bucket();
const db = admin.firestore();

async function run() {
  const logoPath =
    "C:\\Users\\ra_la\\.gemini\\antigravity-ide\\brain\\2163dfe6-7ac0-4cb2-9be6-e234d991cd02\\logo_panaderia_demo_1780619517279.png";
  const dest = "logos/marca_demo/logo.png";

  await bucket.upload(logoPath, {
    destination: dest,
    metadata: { contentType: "image/png" },
  });

  const file = bucket.file(dest);
  await file.makePublic();

  const url = "https://storage.googleapis.com/" + bucket.name + "/" + dest;
  console.log("Logo subido:", url);

  await db
    .collection("marcas")
    .doc("marca_demo")
    .update({ "identidad_visual.logo_url": url });
  console.log("Firestore actualizado con logo_url:", url);
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
