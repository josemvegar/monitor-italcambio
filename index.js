const express = require('express');
const axios = require('axios');
const moment = require('moment-timezone');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para parsear JSON y form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración INICIAL
const CONFIG = {
  targetUrl: 'https://www.italcambio.com/appointmentAPI/public/exchange/availaptmentbyhour.php',
  requestBody: {
    idlocation: 12,
    date: '15/11/2025'
  },
  checkInterval: 1000, // 1 segundo entre llamadas
  logInterval: 60 * 60 * 1000, // 1 hora en milisegundos
  timezone: 'America/Caracas',
  logFile: 'monitor.log'
};

// Estado del monitor
let state = {
  lastDifferentResponse: null,
  lastDifferentResponseTime: null,
  requestCount: 0,
  lastLogTime: Date.now(),
  hourWithoutChanges: true,
  isRunning: true,
  startTime: new Date(),
  totalRequests: 0,
  totalChanges: 0,
  currentConfig: { ...CONFIG.requestBody } // Configuración actual
};

// Función para escribir en el archivo de log
function writeToLog(message) {
  const timestamp = getVenezuelaTime();
  const logMessage = `[${timestamp}] ${message}\n`;
  
  fs.appendFile(CONFIG.logFile, logMessage, (err) => {
    if (err) {
      console.error('Error escribiendo en log:', err);
    }
  });
  
  console.log(message);
}

// Función para obtener la hora actual de Venezuela
function getVenezuelaTime() {
  return moment().tz(CONFIG.timezone).format('YYYY-MM-DD HH:mm:ss');
}

// Función para leer los logs
function readLogs(limit = 100) {
  try {
    if (!fs.existsSync(CONFIG.logFile)) {
      return [];
    }
    
    const logContent = fs.readFileSync(CONFIG.logFile, 'utf8');
    const lines = logContent.split('\n').filter(line => line.trim() !== '');
    return lines.slice(-limit).reverse(); // Últimas líneas primero
  } catch (error) {
    return [`Error leyendo logs: ${error.message}`];
  }
}

// Función para hacer la solicitud POST
async function makeRequest() {
  if (!state.isRunning) return;

  try {
    const response = await axios.post(CONFIG.targetUrl, state.currentConfig, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });

    state.requestCount++;
    state.totalRequests++;
    
    // Verificación robusta de la respuesta
    const hasDifferentResponse = 
      !response.data || // Si no hay data
      !response.data.message || // Si no existe la propiedad message
      response.data.message !== "Sin Disponibilidad"; // Si existe pero es diferente
    
    if (hasDifferentResponse) {
      const venezuelaTime = getVenezuelaTime();
      state.totalChanges++;
      
      const alertMessage = `🚨 RESPUESTA DIFERENTE ENCONTRADA - ${venezuelaTime}`;
      const responseMessage = `📦 Respuesta: ${JSON.stringify(response.data)}`;
      const configMessage = `⚙️ Configuración: Ubicación ${state.currentConfig.idlocation}, Fecha ${state.currentConfig.date}`;
      
      writeToLog(alertMessage);
      writeToLog(configMessage);
      writeToLog(responseMessage);
      writeToLog('---');
      
      // Actualizar estado
      state.lastDifferentResponse = response.data;
      state.lastDifferentResponseTime = venezuelaTime;
      state.hourWithoutChanges = false;
    }
    
  } catch (error) {
    const venezuelaTime = getVenezuelaTime();
    // Solo loguear errores que NO sean 400
    if (!error.message.includes('404') && !error.message.includes('Bad Request')) {
      const errorMessage = `❌ ERROR: ${error.message}`;
      writeToLog(errorMessage);
    }
    
    // Si es un error de timeout, esperar un poco más antes del próximo intento
    if (error.code === 'ECONNABORTED') {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  } finally {
    // ✅ ESTA PARTE SIEMPRE SE EJECUTA, TANTO EN ÉXITO COMO EN ERROR
    // Verificar si es hora de hacer log (cada hora)
    const now = Date.now();
    if (now - state.lastLogTime >= CONFIG.logInterval) {
      const venezuelaTime = getVenezuelaTime();
      
      let logMessage;
      if (state.hourWithoutChanges) {
        logMessage = `📊 [LOG HORARIO] ${venezuelaTime} - ${state.requestCount} solicitudes realizadas - Sin cambios en la última hora | Config: Ubicación ${state.currentConfig.idlocation}, Fecha ${state.currentConfig.date}`;
      } else {
        logMessage = `🎯 [LOG HORARIO] ${venezuelaTime} - ${state.requestCount} solicitudes realizadas - Se encontraron cambios durante esta hora | Último cambio: ${state.lastDifferentResponseTime} | Config: Ubicación ${state.currentConfig.idlocation}, Fecha ${state.currentConfig.date}`;
      }
      
      writeToLog(logMessage);
      
      // Reiniciar contadores para la próxima hora
      state.lastLogTime = now;
      state.requestCount = 0;
      state.hourWithoutChanges = true;
    }
  }
}

// Función principal del monitor
async function startMonitor() {
  const startMessage = `🚀 Iniciando monitor de Italcambio...
📍 Ubicación: ${state.currentConfig.idlocation}
📅 Fecha: ${state.currentConfig.date}
⏰ Zona horaria: ${CONFIG.timezone}
🔁 Intervalo de verificación: ${CONFIG.checkInterval} ms
📝 Log cada: ${CONFIG.logInterval / 1000 / 60} minutos
${'='.repeat(50)}`;

  writeToLog(startMessage);
  
  // Bucle de monitoreo
  while (state.isRunning) {
    await makeRequest();
    await new Promise(resolve => setTimeout(resolve, CONFIG.checkInterval));
  }
}

// Routes de Express
app.get('/', (req, res) => {
  const uptime = Math.floor((Date.now() - state.startTime) / 1000);
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = uptime % 60;
  
  const logs = readLogs(50); // Últimos 50 logs
  
  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Monitor Italcambio</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            margin: 20px; 
            background-color: #f5f5f5;
        }
        .container { 
            max-width: 1200px; 
            margin: 0 auto; 
            background: white; 
            padding: 20px; 
            border-radius: 10px; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .status { 
            background: #e8f5e8; 
            padding: 15px; 
            border-radius: 5px; 
            margin-bottom: 20px;
            border-left: 4px solid #4CAF50;
        }
        .alert { 
            background: #fff3cd; 
            padding: 15px; 
            border-radius: 5px; 
            margin-bottom: 20px;
            border-left: 4px solid #ffc107;
        }
        .config-form {
            background: #e3f2fd;
            padding: 20px;
            border-radius: 5px;
            margin-bottom: 20px;
            border-left: 4px solid #2196F3;
        }
        .form-group {
            margin-bottom: 15px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        input, select {
            width: 100%;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
        }
        button {
            background: #2196F3;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        button:hover {
            background: #1976D2;
        }
        .logs { 
            background: #f8f9fa; 
            padding: 15px; 
            border-radius: 5px; 
            font-family: monospace; 
            font-size: 14px; 
            max-height: 600px; 
            overflow-y: auto;
            white-space: pre-wrap;
        }
        .log-entry { 
            margin-bottom: 5px; 
            padding: 2px 5px; 
            border-radius: 3px;
        }
        .log-entry:hover { 
            background: #e9ecef; 
        }
        .log-error { color: #dc3545; }
        .log-success { color: #28a745; font-weight: bold; }
        .log-info { color: #17a2b8; }
        .log-warning { color: #ffc107; }
        .stats { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
            gap: 15px; 
            margin-bottom: 20px;
        }
        .stat-card { 
            background: #f8f9fa; 
            padding: 15px; 
            border-radius: 5px; 
            text-align: center;
            border-left: 4px solid #007bff;
        }
        .stat-number { 
            font-size: 24px; 
            font-weight: bold; 
            color: #007bff;
        }
        h1 { color: #333; }
        .timestamp { color: #6c757d; font-size: 0.9em; }
        .current-config {
            background: #fff3e0;
            padding: 10px;
            border-radius: 5px;
            margin-bottom: 10px;
            border-left: 4px solid #FF9800;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Monitor de Italcambio</h1>
        
        <!-- Formulario de Configuración -->
        <div class="config-form">
            <h3>⚙️ Configuración del Monitor</h3>
            <form action="/update-config" method="POST">
                <div class="form-group">
                    <label for="date">Fecha (DD/MM/YYYY):</label>
                    <input type="text" id="date" name="date" 
                           value="${state.currentConfig.date}" 
                           placeholder="DD/MM/YYYY" required
                           pattern="\\d{2}/\\d{2}/\\d{4}">
                    <small>Formato: DD/MM/YYYY (ej: 15/11/2025)</small>
                </div>
                <div class="form-group">
                    <label for="idlocation">Ubicación:</label>
                    <select id="idlocation" name="idlocation">
                        <option value="12" ${state.currentConfig.idlocation == 12 ? 'selected' : ''}>Sede Principal (12)</option>
                        <option value="1" ${state.currentConfig.idlocation == 1 ? 'selected' : ''}>Sede 1</option>
                        <option value="2" ${state.currentConfig.idlocation == 2 ? 'selected' : ''}>Sede 2</option>
                        <option value="3" ${state.currentConfig.idlocation == 3 ? 'selected' : ''}>Sede 3</option>
                    </select>
                </div>
                <button type="submit">Actualizar Configuración</button>
            </form>
        </div>

        <div class="current-config">
            <strong>📋 Configuración Actual:</strong><br>
            <strong>Ubicación:</strong> ${state.currentConfig.idlocation} | 
            <strong>Fecha:</strong> ${state.currentConfig.date}
        </div>
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-number">${state.totalRequests}</div>
                <div>Total de Solicitudes</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${state.totalChanges}</div>
                <div>Cambios Detectados</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${hours}h ${minutes}m ${seconds}s</div>
                <div>Tiempo Activo</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${state.isRunning ? '🟢 Activo' : '🔴 Detenido'}</div>
                <div>Estado</div>
            </div>
        </div>
        
        ${state.lastDifferentResponseTime ? `
        <div class="alert">
            <strong>🎯 Último Cambio Detectado:</strong><br>
            <strong>Hora:</strong> ${state.lastDifferentResponseTime}<br>
            <strong>Configuración:</strong> Ubicación ${state.currentConfig.idlocation}, Fecha ${state.currentConfig.date}<br>
            <strong>Respuesta:</strong> ${JSON.stringify(state.lastDifferentResponse)}
        </div>
        ` : `
        <div class="status">
            <strong>⏳ Esperando cambios...</strong><br>
            Monitoreando activamente la disponibilidad de citas para: Ubicación ${state.currentConfig.idlocation}, Fecha ${state.currentConfig.date}
        </div>
        `}
        
        <h2>Últimos Logs</h2>
        <div class="logs">
            ${logs.map(log => {
                let cssClass = 'log-info';
                if (log.includes('🚨') || log.includes('RESPUESTA DIFERENTE')) cssClass = 'log-success';
                if (log.includes('❌') || log.includes('ERROR')) cssClass = 'log-error';
                if (log.includes('📊') || log.includes('LOG HORARIO')) cssClass = 'log-warning';
                
                return `<div class="log-entry ${cssClass}">${log}</div>`;
            }).join('')}
            ${logs.length === 0 ? '<div class="log-entry">No hay logs disponibles</div>' : ''}
        </div>
        
        <div style="margin-top: 20px; text-align: center; color: #6c757d;">
            Última actualización: ${getVenezuelaTime()} (Hora de Venezuela)
        </div>
    </div>
    
    <script>
        // Actualizar cada 10 segundos
        setTimeout(() => {
            location.reload();
        }, 10000);
    </script>
</body>
</html>
  `;
  
  res.send(html);
});

// Ruta para actualizar configuración
app.post('/update-config', (req, res) => {
  const { date, idlocation } = req.body;
  
  // Validar fecha
  const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
  if (!dateRegex.test(date)) {
    return res.redirect('/?error=Formato de fecha inválido. Use DD/MM/YYYY');
  }
  
  // Actualizar configuración
  const oldConfig = { ...state.currentConfig };
  state.currentConfig.date = date;
  state.currentConfig.idlocation = parseInt(idlocation);
  
  // Log del cambio
  const changeMessage = `⚙️ CONFIGURACIÓN ACTUALIZADA: De Ubicación ${oldConfig.idlocation}, Fecha ${oldConfig.date} → A Ubicación ${state.currentConfig.idlocation}, Fecha ${state.currentConfig.date}`;
  writeToLog(changeMessage);
  
  // Reiniciar algunos contadores para la nueva configuración
  state.requestCount = 0;
  state.hourWithoutChanges = true;
  state.lastDifferentResponse = null;
  state.lastDifferentResponseTime = null;
  
  res.redirect('/?success=Configuración actualizada correctamente');
});

app.get('/api/status', (req, res) => {
  res.json({
    status: state.isRunning ? 'running' : 'stopped',
    startTime: state.startTime,
    totalRequests: state.totalRequests,
    totalChanges: state.totalChanges,
    lastChange: state.lastDifferentResponseTime,
    lastResponse: state.lastDifferentResponse,
    currentConfig: state.currentConfig,
    uptime: Date.now() - state.startTime
  });
});

app.get('/api/config', (req, res) => {
  res.json(state.currentConfig);
});

app.post('/api/config', (req, res) => {
  const { date, idlocation } = req.body;
  
  // Validaciones
  const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
  if (!dateRegex.test(date)) {
    return res.status(400).json({ error: 'Formato de fecha inválido. Use DD/MM/YYYY' });
  }
  
  const oldConfig = { ...state.currentConfig };
  state.currentConfig.date = date;
  state.currentConfig.idlocation = parseInt(idlocation);
  
  const changeMessage = `⚙️ CONFIGURACIÓN ACTUALIZADA vía API: De Ubicación ${oldConfig.idlocation}, Fecha ${oldConfig.date} → A Ubicación ${state.currentConfig.idlocation}, Fecha ${state.currentConfig.date}`;
  writeToLog(changeMessage);
  
  // Reiniciar contadores
  state.requestCount = 0;
  state.hourWithoutChanges = true;
  state.lastDifferentResponse = null;
  state.lastDifferentResponseTime = null;
  
  res.json({ 
    success: true, 
    message: 'Configuración actualizada',
    newConfig: state.currentConfig 
  });
});

app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const logs = readLogs(limit);
  res.json({ logs });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🌐 Servidor web corriendo en puerto ${PORT}`);
  console.log(`📊 Dashboard disponible en: http://localhost:${PORT}`);
  
  // Iniciar el monitor después de que Express esté listo
  startMonitor().catch(error => {
    console.error('Error fatal en el monitor:', error);
    process.exit(1);
  });
});

// Manejo de cierre graceful
process.on('SIGINT', () => {
  console.log('\n🛑 Deteniendo monitor...');
  state.isRunning = false;
  writeToLog('Monitor detenido por el usuario');
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Monitor detenido por el sistema');
  state.isRunning = false;
  writeToLog('Monitor detenido por el sistema');
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});