const express = require('express');
const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const eventBus = require('./controllers/servicios/eventBus');
require('dotenv').config();

const app = express();
const http = require('http').createServer(app);
const { Server } = require('socket.io');

console.log(process.env.USE_PROD_ORIGIN);

// CORREGIDO: Configuración mejorada de CORS para WebSocket - Más permisiva en producción
const allowedOrigins = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://193.147.197.113:3000', // URL específica de producción
  'http://193.147.197.113:4200'  // Por si acaso el frontend está en puerto diferente
];

// Agregar origen de producción si existe
if (process.env.CLIENT_ORIGIN_PROD) {
  allowedOrigins.push(process.env.CLIENT_ORIGIN_PROD);
}

// NUEVO: Detectar automáticamente si estamos en producción y ser más permisivo
const isProduction = process.env.USE_PROD_ORIGIN === 'true';
const productionHost = '193.147.197.113';

// En producción, agregar más variantes de URLs
if (isProduction) {
  allowedOrigins.push(
    `http://${productionHost}:3000`,
    `https://${productionHost}:3000`,
    `http://${productionHost}:4200`,
    `https://${productionHost}:4200`,
    `http://${productionHost}`,
    `https://${productionHost}`
  );
}

console.log('🌍 URLs permitidas para CORS:', allowedOrigins);

const clientOrigin = process.env.USE_PROD_ORIGIN === 'true'
  ? process.env.CLIENT_ORIGIN_PROD || `http://${productionHost}:3000`
  : 'http://localhost:4200';

const io = new Server(http, {
  cors: {
    origin: allowedOrigins, 
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  },
  allowEIO3: true,
  transports: ['websocket', 'polling'],
  // NUEVO: Configuración más robusta para producción
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  maxHttpBufferSize: 1e6
});

// PARA TRABAJAR EN LOCALHOST coloca esto en console-->  USE_PROD_ORIGIN=false node index.js
console.log(`✅ CORS habilitado para: ${allowedOrigins.join(', ')}`);
console.log(`✅ WebSocket CORS habilitado para múltiples orígenes`);

// CORREGIDO: Mejorar el manejo de eventos de progreso con más debugging
eventBus.on('progreso', (msg) => {
  console.log('📡 EventBus recibió evento de progreso:', msg);
  console.log('📊 Clientes WebSocket conectados:', io.engine.clientsCount);
  
  const progressData = {
    porcentaje: msg.porcentaje || 0,
    mensaje: msg.mensaje || 'Procesando...',
    timestamp: new Date().toISOString()
  };
  console.log('📤 Emitiendo por WebSocket:', progressData);
  
  // NUEVO: Emitir con confirmación de entrega
  const emitted = io.emit('progreso', progressData);
  console.log('✅ Evento emitido, resultado:', emitted);
  
  // NUEVO: Log adicional para debugging en producción
  if (io.engine.clientsCount === 0) {
    console.warn('⚠️ ADVERTENCIA: No hay clientes WebSocket conectados para recibir el progreso');
  }
});

// ------------------------
// Middleware
// ------------------------
app.use(cors({
  origin: function(origin, callback) {
    // NUEVO: Función más permisiva para CORS en producción
    console.log('🔍 Verificando origen CORS:', origin);
    
    // Permitir requests sin origin (como Postman, aplicaciones móviles, etc.)
    if (!origin) {
      console.log('✅ Origen vacío permitido');
      return callback(null, true);
    }
    
    // Verificar si el origen está en la lista permitida
    if (allowedOrigins.indexOf(origin) !== -1) {
      console.log('✅ Origen permitido:', origin);
      return callback(null, true);
    }
    
    // En producción, ser más permisivo con IPs locales
    if (isProduction && origin.includes(productionHost)) {
      console.log('✅ Origen de producción permitido:', origin);
      return callback(null, true);
    }
    
    console.warn('❌ Origen no permitido:', origin);
    console.warn('📋 Orígenes permitidos:', allowedOrigins);
    
    // En desarrollo, rechazar; en producción, ser más permisivo
    if (isProduction) {
      console.log('🚀 Modo producción: Permitiendo origen por compatibilidad');
      return callback(null, true);
    } else {
      return callback(new Error('No permitido por CORS'), false);
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Headers para Chrome Private Network Access (PNA) - Solución para bloqueo de send-code
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', clientOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    return res.status(200).end();
  }
  next();
});

app.use(express.json());

// ------------------------
// Configuración de Multer
// ------------------------
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

// ------------------------
// Variables de control
// ------------------------
let enProceso = false;
let currentChild = null;
let descargando = false; // evita borrar informe durante la descarga
const informePath = path.join(__dirname, 'controllers/archivos/FRAGILDIALResultados.xlsx');

// ------------------------
// Limpiezas
// ------------------------
function borrarUploads() {
  const uploadDirPath = path.join(__dirname, 'uploads');
  fs.readdir(uploadDirPath, (err, files) => {
    if (err) return;
    files.forEach(file => {
      fs.unlink(path.join(uploadDirPath, file), err => {
        if (!err) console.log(`🗑️ Archivo eliminado: ${file}`);
      });
    });
  });
}

function borrarInforme(force = false) {
  if (descargando && !force) {
    console.log('⏳ Descarga en curso: omito borrado de informe.');
    return;
  }
  fs.unlink(informePath, (err) => {
    if (!err) {
      console.log('🗑️ Informe FRAGILDIALResultados.xlsx eliminado.');
    }
  });
}

function limpiarUploads() {
  console.log('🔄 Limpieza: borrando uploads.');
  borrarUploads();
}

function limpiarUploadsEInforme() {
  console.log('🔄 Limpieza: borrando uploads e informe.');
  borrarUploads();
  borrarInforme();
}

// ------------------------
// Función centralizada para resetear el servidor al estado inicial
// ------------------------
function resetearServidorCompleto(motivo = 'reset manual') {
  console.log(`🔄 === RESETEANDO SERVIDOR COMPLETO (${motivo}) ===`);
  
  // 1) Si hay un worker en ejecución, matarlo completamente
  if (currentChild) {
    console.log(`💥 Matando worker (PID ${currentChild.pid})`);
    
    // Verificar si el worker aún está conectado antes de enviar comandos
    if (currentChild.connected) {
      try {
        currentChild.send({ comando: 'terminar' });
        console.log('📤 Comando de terminación elegante enviado');
      } catch (err) {
        console.log('⚠️ Error enviando comando elegante:', err.message);
      }
    } else {
      console.log('⚠️ Worker ya desconectado, no se puede enviar comando elegante');
    }
    
    // Forzar la terminación
    try {
      if (!currentChild.killed) {
        currentChild.kill('SIGTERM');
        console.log('🔪 Worker terminado con SIGTERM');
      } else {
        console.log('ℹ️ Worker ya estaba marcado como terminado');
      }
    } catch (err) {
      console.log('⚠️ Error con SIGTERM:', err.message);
      try {
        if (!currentChild.killed) {
          currentChild.kill('SIGKILL');
          console.log('💀 Worker terminado con SIGKILL (forzado)');
        }
      } catch (killErr) {
        console.error('❌ Error incluso con SIGKILL:', killErr.message);
      }
    }
    
    // Desconectar explícitamente el canal IPC si aún está conectado
    try {
      if (currentChild.connected) {
        currentChild.disconnect();
        console.log('🔌 Canal IPC desconectado');
      }
    } catch (disconnectErr) {
      console.log('⚠️ Error desconectando IPC:', disconnectErr.message);
    }
    
    currentChild = null;
    console.log('✅ Worker completamente eliminado');
  } else {
    console.log('ℹ️ No hay worker en ejecución');
  }

  // 2) Restablecer TODAS las variables de estado al estado inicial
  enProceso = false;
  descargando = false;
  console.log('✅ Variables de estado reseteadas');
  
  // 3) Limpiar todos los archivos
  console.log('🧹 Iniciando limpieza de archivos...');
  
  // Limpiar uploads de forma síncrona
  const uploadDirPath = path.join(__dirname, 'uploads');
  try {
    if (fs.existsSync(uploadDirPath)) {
      const files = fs.readdirSync(uploadDirPath);
      files.forEach(file => {
        try {
          fs.unlinkSync(path.join(uploadDirPath, file));
          console.log(`🗑️ Archivo eliminado: ${file}`);
        } catch (err) {
          console.log(`⚠️ No se pudo eliminar ${file}:`, err.message);
        }
      });
      console.log('✅ Directorio uploads limpiado');
    } else {
      console.log('ℹ️ Directorio uploads no existe o ya está vacío');
    }
  } catch (err) {
    console.log('⚠️ Error al limpiar uploads:', err.message);
  }
  
  // Limpiar informe de forma síncrona
  try {
    if (fs.existsSync(informePath)) {
      fs.unlinkSync(informePath);
      console.log('🗑️ Informe FRAGILDIALResultados.xlsx eliminado');
    } else {
      console.log('ℹ️ No hay informe para eliminar');
    }
  } catch (err) {
    console.log('⚠️ Error al eliminar informe:', err.message);
  }
  
  // 4) Limpiar el store de códigos de Telegram
  const codigosAnteriores = Object.keys(codeStore).length;
  Object.keys(codeStore).forEach(key => delete codeStore[key]);
  console.log(`🧹 Store de códigos limpiado (${codigosAnteriores} códigos eliminados)`);
  
  // 5) Emitir evento de reset a todos los clientes WebSocket
  try {
    io.emit('servidor-reseteado', { 
      mensaje: `Servidor completamente reseteado (${motivo})`, 
      timestamp: new Date().toISOString(),
      estado_inicial: true
    });
    console.log('📡 Evento de reset enviado a clientes WebSocket');
  } catch (wsErr) {
    console.log('⚠️ Error enviando evento WebSocket:', wsErr.message);
  }
  
  // 6) Mostrar estado final
  console.log('📊 === ESTADO FINAL DEL SERVIDOR ===');
  console.log(`   ✅ enProceso: ${enProceso}`);
  console.log(`   ✅ currentChild: ${currentChild}`);
  console.log(`   ✅ descargando: ${descargando}`);
  console.log(`   ✅ codeStore limpio: ${Object.keys(codeStore).length === 0}`);
  console.log('🎯 Servidor completamente reseteado al estado inicial');
  console.log('🚀 Listo para recibir nuevos trabajos');
  console.log('✅ === RESET COMPLETO FINALIZADO ===');
  
  return {
    success: true,
    message: `Servidor reseteado completamente al estado inicial (${motivo})`,
    estado: {
      enProceso: false,
      workerActivo: false,
      archivosLimpiados: true,
      codigosLimpiados: true,
      estadoInicial: true
    },
    timestamp: new Date().toISOString()
  };
}

// ------------------------
// NUEVA: Función para reset suave del servidor (sin interrumpir WebSocket)
// ------------------------
function resetearServidorSuave(motivo = 'reset suave') {
  console.log(`🔄 === RESET SUAVE DEL SERVIDOR (${motivo}) ===`);
  
  // 1) Solo resetear variables de estado, NO matar worker si ya terminó
  enProceso = false;
  descargando = false;
  
  // 2) Si hay worker, solo limpiarlo sin forzar terminación
  if (currentChild) {
    console.log(`🧹 Limpiando referencia al worker completado`);
    currentChild = null;
  }
  
  console.log('✅ Variables de estado reseteadas suavemente');
  
  // 3) Limpiar archivos de forma asíncrona y suave
  console.log('🧹 Iniciando limpieza suave de archivos...');
  
  setTimeout(() => {
    // Limpiar uploads sin bloquear
    const uploadDirPath = path.join(__dirname, 'uploads');
    if (fs.existsSync(uploadDirPath)) {
      fs.readdir(uploadDirPath, (err, files) => {
        if (!err && files.length > 0) {
          files.forEach(file => {
            fs.unlink(path.join(uploadDirPath, file), (unlinkErr) => {
              if (!unlinkErr) console.log(`🗑️ Archivo eliminado suavemente: ${file}`);
            });
          });
        }
        console.log('✅ Directorio uploads limpiado suavemente');
      });
    }
    
    // Limpiar informe si existe
    if (fs.existsSync(informePath)) {
      fs.unlink(informePath, (err) => {
        if (!unlinkErr) console.log('🗑️ Informe eliminado suavemente');
      });
    }
  }, 1000);
  
  // 4) Limpiar códigos de Telegram
  const codigosAnteriores = Object.keys(codeStore).length;
  Object.keys(codeStore).forEach(key => delete codeStore[key]);
  console.log(`🧹 Store de códigos limpiado suavemente (${codigosAnteriores} códigos)`);
  
  // 5) NO emitir evento de reset para no confundir al frontend que está procesando datos
  console.log('ℹ️ Reset suave completado - WebSocket mantiene conexiones activas');
  
  // 6) Mostrar estado final
  console.log('📊 === ESTADO DESPUÉS DEL RESET SUAVE ===');
  console.log(`   ✅ enProceso: ${enProceso}`);
  console.log(`   ✅ currentChild: ${currentChild}`);
  console.log(`   ✅ descargando: ${descargando}`);
  console.log(`   ✅ WebSocket: Conexiones mantenidas`);
  console.log('🎯 Reset suave completado - Sistema listo para nuevos trabajos');
  console.log('✅ === RESET SUAVE FINALIZADO ===');
  
  return {
    success: true,
    message: `Reset suave completado (${motivo})`,
    estado: {
      enProceso: false,
      workerActivo: false,
      webSocketActivo: true,
      estadoInicial: true
    },
    timestamp: new Date().toISOString()
  };
}

// ------------------------
// Endpoint: /api/upload - Maneja la carga y procesamiento de archivos
// ------------------------
app.post('/api/upload', (req, res) => {
  // 1. Control de concurrencia
  if (enProceso) {
    return res.status(429).json({ error: 'Ya hay un estudio en curso. Intenta más tarde.' });
  }
  enProceso = true;

  // 2. Procesamiento de la carga de archivos con Multer
  upload.array('files')(req, res, (err) => {
    if (err) {
      enProceso = false;
      return res.status(500).json({ message: 'Error al subir archivos', error: err });
    }

    try {
      // 3. Extracción y validación de parámetros
      const { intervalo, baseDatos, indices } = req.body;
      console.log('✅ Datos de cuerpo (body) recibidos:', { intervalo, baseDatos, indices });
      
      // 3.1 Validación del intervalo de fechas
      if (!intervalo || !Array.isArray(intervalo) || intervalo.length !== 2) {
        enProceso = false;
        return res.status(400).json({ message: 'Intervalo de fechas inválido' });
      }

      // 3.2 Validación de bases de datos
      if (!baseDatos || !Array.isArray(baseDatos) || baseDatos.length === 0) {
        enProceso = false;
        return res.status(400).json({ message: 'Base de datos inválida o no seleccionada' });
      }

      // 3.3 Validación de índices
      if (!indices || !Array.isArray(indices) || indices.length === 0) {
        enProceso = false;
        return res.status(400).json({ message: 'Índices inválidos o no seleccionados' });
      }

      const [fechaInicio, fechaFin] = intervalo;

      // 3.4 Validación adicional de fechas
      if (!fechaInicio || !fechaFin) {
        enProceso = false;
        return res.status(400).json({ message: 'Fechas requeridas' });
      }

      // 4. Inicialización y configuración del worker
      const workerPath = path.join(__dirname, 'controllers/flux/worker.js');
      currentChild = fork(workerPath, [
        fechaInicio,
        fechaFin,
        JSON.stringify(baseDatos),
        JSON.stringify(indices)
      ]);

      // 5. Manejo de mensajes del worker
      currentChild.on('message', (msg) => {
        console.log('📨 Mensaje recibido del worker:', JSON.stringify(msg, null, 2));
        
        // 5.1 Emisión de progreso - CORREGIDO con mejor logging
        if (msg.progreso !== undefined) {
          const progressData = { 
            porcentaje: msg.progreso, 
            mensaje: msg.mensaje || 'Procesando...',
            timestamp: new Date().toISOString()
          };
          console.log('📡 Emitiendo progreso por WebSocket:', JSON.stringify(progressData, null, 2));
          console.log('📊 Clientes conectados:', io.engine.clientsCount);
          
          // Emitir tanto por WebSocket directo como por eventBus
          io.emit('progreso', progressData);
          eventBus.emit('progreso', progressData);
        }

        // 5.2 Manejo de errores del worker
        if (msg.error) {
          console.log('❌ Error en el worker:', msg.error);
          const errorData = { porcentaje: 0, mensaje: `Error: ${msg.error}` };
          console.log('📡 Emitiendo error por WebSocket:', errorData);
          io.emit('progreso', errorData);

          if (currentChild) {
            currentChild.kill();
            currentChild = null;
          }
          resetearServidorCompleto('error en worker');

          if (!res.headersSent) {
            return res.status(500).json({ message: 'Error en el worker', error: msg.error });
          }
          return;
        }

        // 5.3 Procesamiento de finalización y envío de resultados - SINCRONIZADO
        if (msg.terminado) {
          console.log('✅ Proceso completado. Enviando datos INMEDIATAMENTE.');
          
          // SINCRONIZADO: Enviar progreso 100% CON datos en el mismo momento
          const finalDataEvent = { 
            porcentaje: 100, 
            mensaje: 'Análisis completado - Datos listos',
            resultados: msg.resultados || [],
            timestamp: new Date().toISOString(),
            completed: true,
            success: true
          };
          
          console.log('📡 SINCRONIZADO: Enviando 100% + DATOS simultáneamente:', {
            porcentaje: finalDataEvent.porcentaje,
            mensaje: finalDataEvent.mensaje,
            resultadosCount: finalDataEvent.resultados.length
          });
          
          // Emitir datos por WebSocket SIN DELAY
          io.emit('progreso', finalDataEvent);
          
          // Respuesta HTTP inmediata y simple
          if (!res.headersSent) {
            res.status(200).json({ 
              success: true,
              message: 'Datos enviados por WebSocket',
              timestamp: new Date().toISOString()
            });
          }
          
          // Reset suave después de confirmar envío
          setTimeout(() => {
            resetearServidorSuave('trabajo completado exitosamente');
          }, 3000); // Reducido a 3 segundos
        }
      });

      // NUEVO: Logging de conexiones WebSocket
      currentChild.on('error', (error) => {
        console.error('❌ Error del proceso worker:', error);
      });

      currentChild.on('exit', (code, signal) => {
        console.log(`🏁 Worker terminó con código: ${code}, señal: ${signal}`);
      });

    } catch (error) {
      // 7. Manejo de errores generales
      console.error('Error en el procesamiento:', error);
      enProceso = false;
      currentChild = null;
      resetearServidorCompleto('error general en procesamiento');
      return res.status(500).json({ message: 'Error en el procesamiento', error: error.message });
    }
  });
});

// ------------------------
// Endpoint: /api/reset
// ------------------------
app.post('/api/reset', (req, res) => {
  try {
    const resultado = resetearServidorCompleto('reset manual');
    res.status(200).json(resultado);
  } catch (err) {
    console.error('⛔ === ERROR EN RESET COMPLETO ===');
    console.error('Error:', err);
    
    // Aún así, intentar limpiar lo que se pueda
    enProceso = false;
    currentChild = null;
    descargando = false;
    
    res.status(500).json({ 
      success: false,
      message: 'Error parcial al resetear el backend, pero estado limpiado',
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ------------------------
// Endpoint: /api/logout
// ------------------------
app.post('/api/logout', (req, res) => {
  if (!descargando) {
    limpiarUploadsEInforme();
    enProceso = false;
  } else {
    console.log('⏳ Logout durante descarga: omito borrado de informe.');
    limpiarUploads();
  }
  res.json({ message: 'Desconectado.' });
});

// ------------------------
// Endpoint: /api/consulta
// ------------------------
app.post('/api/consulta', (req, res) => {
  try {
    const { intervalo, baseDatos, indices } = req.body;
    
    if (!intervalo || !Array.isArray(intervalo) || intervalo.length !== 2) {
      return res.status(400).json({ message: 'El intervalo de fechas es inválido' });
    }

    if (!baseDatos || !Array.isArray(baseDatos) || baseDatos.length === 0) {
      return res.status(400).json({ message: 'Debe seleccionar al menos una base de datos' });
    }

    if (!indices || !Array.isArray(indices) || indices.length === 0) {
      return res.status(400).json({ message: 'Debe seleccionar al menos un índice' });
    }

    console.log('Datos de consulta recibidos:', { intervalo, baseDatos, indices });

    res.status(200).json({ 
      message: 'Consulta recibida correctamente',
      data: { intervalo, baseDatos, indices }
    });
    
  } catch (error) {
    console.error('Error procesando la consulta:', error);
    res.status(500).json({ message: 'Error interno procesando la consulta' });
  }
});

// ------------------------
// Envío de código por Telegram
// ------------------------
const codeStore = {};
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function getUserByEmail(email) {
  const index = Object.keys(process.env)
    .filter(key => key.startsWith('TELEGRAM_EMAIL_'))
    .find(key => process.env[key] === email);
  if (!index) return null;
  const suffix = index.split('_').pop();
  return {
    email,
    token: process.env[`TELEGRAM_BOT_TOKEN_${suffix}`],
    chatId: process.env[`TELEGRAM_CHAT_ID_${suffix}`]
  };
}

app.post('/api/send-code', async (req, res) => {
  const { email } = req.body;
  const user = getUserByEmail(email);
  if (!user) return res.status(404).json({ message: 'Email no autorizado' });

  const code = generateCode();
  codeStore[email] = { code, timestamp: Date.now() };

  try {
    await axios.post(`https://api.telegram.org/bot${user.token}/sendMessage`, {
      chat_id: user.chatId,
      text: `Tu código de acceso es: ${code}. Caduca en 2 minutos.`,
    });
    res.json({ message: 'Código enviado' });
  } catch (error) {
    res.status(500).json({ message: 'Error al enviar mensaje a Telegram', error });
  }
});

app.post('/api/verify-code', (req, res) => {
  const { email, code } = req.body;
  const entry = codeStore[email];
  if (!entry) return res.status(400).json({ message: 'No hay código enviado' });

  const expired = Date.now() - entry.timestamp > 2 * 60 * 1000;
  if (expired) {
    delete codeStore[email];
    return res.status(401).json({ message: 'Código caducado' });
  }
  if (entry.code !== code) {
    return res.status(403).json({ message: 'Código incorrecto' });
  }
  delete codeStore[email];
  res.json({ message: 'Autenticado' });
});

// ------------------------
// WebSocket: conexión y cierre
// ------------------------
io.on('connection', (socket) => {
  console.log('🔌 Cliente conectado por WebSocket - ID:', socket.id);
  console.log('📊 Total clientes conectados:', io.engine.clientsCount);
  
  // Enviar mensaje de prueba al conectarse
  socket.emit('progreso', { porcentaje: 0, mensaje: 'Conexión WebSocket establecida' });
  
  socket.on('disconnect', (reason) => {
    console.log('❌ Cliente desconectado - ID:', socket.id, 'Razón:', reason);
    console.log('📊 Total clientes restantes:', io.engine.clientsCount);
    
    if (!enProceso && !descargando) {
      limpiarUploads();
    }
  });
  
  socket.on('error', (error) => {
    console.error('🚫 Error en socket WebSocket:', error);
  });
});

// ------------------------
// Servir Angular desde public/dist
// ------------------------
app.use(express.static(path.join(__dirname, 'public', 'dist')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'public', 'dist', 'index.html'));
});

// ------------------------
// Arrancar servidor
// ------------------------
const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor con WebSocket en http://0.0.0.0:${PORT}`);
});