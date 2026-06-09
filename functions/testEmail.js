const { google } = require("googleapis");
const auth = new google.auth.GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/drive.file"]
});

async function run() {
  const client = await auth.getClient();
  console.log("SERVICE ACCOUNT EMAIL:", client.email || client.credentials.client_email);
}

run().catch(console.error);
