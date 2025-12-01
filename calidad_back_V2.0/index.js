const express = require('express');
const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors'); // AGREGADO: Import CORS
const multer = require('multer');
const axios = require('axios');
const eventBus = require('./controllers/servicios/eventBus');
require('dotenv').config();

const app = express();
const http = require('http').createServer(app);
const { Server } = require('socket.io');

// ------------------------
// Configuración de entorno optimizada
// ------------------------
// Nota: Si servimos el build de Angular desde este backend, tratamos el entorno como producción
// aunque las variables de entorno no lo indiquen explícitamente. Esto evita que CORS bloquee
// los WebSockets cuando el frontend y backend comparten origen en el servidor real.
const isProduction =
  process.env.USE_PROD_ORIGIN === 'true' ||
  process.env.NODE_ENV === 'production' ||
  fs.existsSync(path.join(__dirname, 'public', 'dist'));
const productionHost = '193.147.197.113';
const configuredOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const defaultDevOrigins = [
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  `http://${productionHost}`,
  `http://${productionHost}:3000`
];
const allowedOrigins = configuredOrigins.length ? configuredOrigins : defaultDevOrigins;
const PORT = process.env.PORT || 3000;

// Verificar si existe build de frontend en producción
const frontendBuildPath = path.join(__dirname, 'public', 'dist');
const hasFrontendBuild = fs.existsSync(frontendBuildPath);

console.log('🏗️ === CONFIGURACIÓN DEL SERVIDOR ===');
console.log(`📦 Modo: ${isProduction ? 'PRODUCCIÓN' : 'DESARROLLO'}`);
console.log(`🌐 Host producción: ${productionHost}`);
console.log(`🔌 Puerto: ${PORT}`);
console.log(`📁 Build frontend encontrado: ${hasFrontendBuild ? '✅ SÍ' : '❌ NO'}`);
console.log(`📍 Ruta build: ${frontendBuildPath}`);
console.log('🌍 Orígenes permitidos (HTTP/WS):', allowedOrigins);

// ------------------------
// Configuración WebSocket optimizada para producción
// ------------------------
let socketConfig;
const useSameOriginSockets = isProduction && hasFrontendBuild && configuredOrigins.length === 0;

if (useSameOriginSockets) {
  console.log('🔌 WebSocket PRODUCCIÓN - Same origin (SIN CORS)');
  socketConfig = {
    cors: false, // CORREGIDO: No CORS necesario en same-origin
    allowEIO3: true,
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
    upgradeTimeout: 30000,
    maxHttpBufferSize: 1e6
  };
} else {
  console.log('🔌 WebSocket DESARROLLO - CORS habilitado');
  console.log('🌍 URLs permitidas para CORS:', allowedOrigins);
  
  socketConfig = {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST', 'OPTIONS'],
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization']
    },
    allowEIO3: true,
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
    upgradeTimeout: 30000,
    maxHttpBufferSize: 1e6
  };
}

const io = new Server(http, socketConfig);

// ------------------------
// Middleware
// ------------------------

// AGREGADO: Middleware CORS para rutas HTTP
if (useSameOriginSockets) {
  console.log('🔧 Middleware HTTP PRODUCCIÓN - CORS básico para same-origin');
  // En producción con archivos estáticos, CORS mínimo
  app.use(cors({
    origin: true, // Permitir same-origin
    credentials: false,
    methods: ['GET', 'POST', 'OPTIONS']
  }));
} else {
  console.log('🔧 Middleware HTTP - CORS habilitado (orígenes configurables)');
  // Permitir orígenes configurables para despliegues cruzados o pruebas
  app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
}

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
  
  if (currentChild) {
    console.log(`💥 Matando worker (PID ${currentChild.pid})`);
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

  enProceso = false;
  descargando = false;
  console.log('✅ Variables de estado reseteadas');
  
  console.log('🧹 Iniciando limpieza de archivos...');
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
  
  const codigosAnteriores = Object.keys(codeStore).length;
  Object.keys(codeStore).forEach(key => delete codeStore[key]);
  console.log(`🧹 Store de códigos limpiado (${codigosAnteriores} códigos eliminados)`);
  
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
// Endpoint: /api/upload - Maneja la carga y procesamiento de archivos
// ------------------------
app.post('/api/upload', (req, res) => {
  if (enProceso) {
    return res.status(429).json({ error: 'Ya hay un estudio en curso. Intenta más tarde.' });
  }
  enProceso = true;

  upload.array('files')(req, res, (err) => {
    if (err) {
      enProceso = false;
      return res.status(500).json({ message: 'Error al subir archivos', error: err });
    }

    try {
      const { intervalo, baseDatos, indices } = req.body;
      console.log('✅ Datos de cuerpo (body) recibidos:', { intervalo, baseDatos, indices });
      
      if (!intervalo || !Array.isArray(intervalo) || intervalo.length !== 2) {
        enProceso = false;
        return res.status(400).json({ message: 'Intervalo de fechas inválido' });
      }

      if (!baseDatos || !Array.isArray(baseDatos) || baseDatos.length === 0) {
        enProceso = false;
        return res.status(400).json({ message: 'Base de datos inválida o no seleccionada' });
      }

      if (!indices || !Array.isArray(indices) || indices.length === 0) {
        enProceso = false;
        return res.status(400).json({ message: 'Índices inválidos o no seleccionados' });
      }

      const [fechaInicio, fechaFin] = intervalo;

      if (!fechaInicio || !fechaFin) {
        enProceso = false;
        return res.status(400).json({ message: 'Fechas requeridas' });
      }

      const workerPath = path.join(__dirname, 'controllers/flux/worker.js');
      currentChild = fork(workerPath, [
        fechaInicio,
        fechaFin,
        JSON.stringify(baseDatos),
        JSON.stringify(indices)
      ]);

      currentChild.on('message', (msg) => {
        console.log('📨 Mensaje recibido del worker:', JSON.stringify(msg, null, 2));
        
        if (msg.progreso !== undefined) {
          const progressData = { 
            porcentaje: msg.progreso, 
            mensaje: msg.mensaje || 'Procesando...',
            timestamp: new Date().toISOString()
          };
          console.log('📡 Emitiendo progreso por WebSocket:', JSON.stringify(progressData, null, 2));
          console.log('📊 Clientes conectados:', io.engine.clientsCount);
          
          io.emit('progreso', progressData);
          eventBus.emit('progreso', progressData);
        }

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

        if (msg.terminado) {
          console.log('✅ Proceso completado. Enviando datos con múltiples intentos para garantizar recepción.');
          
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
          
          // CORRIGIDO: Múltiples envíos para garantizar recepción en producción
          function enviarDatosConReintentos(intentos = 0) {
            const maxIntentos = 5;
            const delay = intentos * 200; // 0ms, 200ms, 400ms, 600ms, 800ms
            
            setTimeout(() => {
              console.log(`📡 Intento ${intentos + 1}/${maxIntentos} - Enviando datos`);
              io.emit('progreso', finalDataEvent);
              
              if (intentos < maxIntentos - 1) {
                enviarDatosConReintentos(intentos + 1);
              } else {
                console.log('✅ Todos los intentos de envío completados');
              }
            }, delay);
          }
          
          // Iniciar secuencia de envíos
          enviarDatosConReintentos();
          
          // También emitir evento de finalización directo
          setTimeout(() => {
            io.emit('analisis-completado', {
              success: true,
              resultados: msg.resultados || [],
              mensaje: 'Datos finales disponibles',
              timestamp: new Date().toISOString()
            });
            console.log('📡 Evento de finalización directo enviado');
          }, 1000);
          
          if (!res.headersSent) {
            res.status(200).json({ 
              success: true,
              message: 'Datos enviados por WebSocket con múltiples intentos',
              resultados_count: (msg.resultados || []).length,
              timestamp: new Date().toISOString()
            });
          }
          
          setTimeout(() => {
            resetearServidorCompleto('trabajo completado exitosamente');
          }, 5000); // Aumentado a 5 segundos para dar tiempo a los múltiples envíos
        }
      });

      currentChild.on('error', (error) => {
        console.error('❌ Error del proceso worker:', error);
      });

      currentChild.on('exit', (code, signal) => {
        console.log(`🏁 Worker terminó con código: ${code}, señal: ${signal}`);
      });

    } catch (error) {
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
if (hasFrontendBuild) {
  app.use(express.static(frontendBuildPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(frontendBuildPath, 'index.html'));
  });
}

// ------------------------
// Arrancar servidor
// ------------------------
http.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor con WebSocket en http://0.0.0.0:${PORT}`);
});