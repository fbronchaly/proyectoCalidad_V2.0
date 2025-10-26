// servicios/notificarTelegram.js
const axios = require('axios');
require('dotenv').config();

async function enviarNotificacion(mensaje) {
  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || '').trim();
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    await axios.post(url, {
      chat_id: chatId,
      text: mensaje
    });
  } catch (err) {
    console.error("❌ Error al enviar notificación Telegram:", err.message);
  }
}

module.exports = { enviarNotificacion };
