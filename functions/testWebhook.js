const axios = require('axios');
require('dotenv').config();

const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function run() {
  await axios.post(`${url}/deleteWebhook`);
  const res = await axios.post(`${url}/setWebhook`, {
    url: 'https://us-central1-saas-estrategias.cloudfunctions.net/ingestaEntradaEspontanea',
    allowed_updates: ['message', 'callback_query'],
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET
  });
  console.log(res.data);
}
run().catch(console.error);
