// servicios/credenciales.js
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const claveSecreta = process.env.SECRET_KEY || 'clave-ultrasecreta';
const archivo = path.join(__dirname, '../config/credenciales.enc');

function guardarCredenciales(email, password, telefono) {
  const datos = JSON.stringify({ email, password, telefono });
  const cipher = crypto.createCipher('aes-256-cbc', claveSecreta);
  let encriptado = cipher.update(datos, 'utf8', 'hex');
  encriptado += cipher.final('hex');
  fs.writeFileSync(archivo, encriptado, 'utf8');
}

function leerCredenciales() {
  const encriptado = fs.readFileSync(archivo, 'utf8');
  const decipher = crypto.createDecipher('aes-256-cbc', claveSecreta);
  let desencriptado = decipher.update(encriptado, 'hex', 'utf8');
  desencriptado += decipher.final('utf8');
  return JSON.parse(desencriptado);
}

module.exports = { guardarCredenciales, leerCredenciales };
