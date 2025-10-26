// controllers/routes/auth.js
const express = require('express');
const router = express.Router();
const { cca } = require('../auth/authAzure');

const redirectUri = process.env.AZURE_REDIRECT_URI;
const scopes = ['user.read'];

// Lista de usuarios permitidos
const allowedUsers = [
  'usuario1@empresa.com',
  'usuario2@empresa.com',
  'admin@empresa.com',
  'fjcapelo@gmail.com',
  'prueba.fragildial@fundacionrenal.es'
];

router.get('/login', (req, res) => {
  const authCodeUrlParams = {
    scopes,
    redirectUri,
  };

  cca.getAuthCodeUrl(authCodeUrlParams)
    .then((response) => res.redirect(response))
    .catch((err) => res.status(500).send('Error en login: ' + err.message));
});

router.get('/redirect', async (req, res) => {
  const tokenRequest = {
    code: req.query.code,
    scopes,
    redirectUri,
  };

  try {
    const response = await cca.acquireTokenByCode(tokenRequest);
    const email = response.account.username;

    if (!allowedUsers.includes(email)) {
      console.warn(`⛔ Usuario no autorizado: ${email}`);
      return res.status(403).send('Usuario no autorizado');
    }

    console.log(`✅ Usuario autenticado: ${email}`);
    res.redirect(`http://localhost:4200/dashboard?user=${encodeURIComponent(email)}`);
  } catch (error) {
    console.error('❌ Error autenticando:', error.message);
    res.status(500).send('Fallo de autenticación.');
  }
});

module.exports = router;
