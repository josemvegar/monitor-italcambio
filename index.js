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

// ⚠️ MODO TEST - Cambia esto para testing/producción
const TEST_MODE = false; // true para testing, false para producción

// Configuración INICIAL
const CONFIG = {
  targetUrl: TEST_MODE
    ? 'http://localhost:3001/appointmentAPI/public/exchange/availaptmentbyhour.php'
    : 'https://www.italcambio.com/appointmentAPI/public/exchange/availaptmentbyhour.php',

  appointmentUrl: TEST_MODE
    ? 'http://localhost:3001/appointmentAPI/public/exchange/appointment.php'
    : 'https://www.italcambio.com/appointmentAPI/public/exchange/appointment.php',

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
  currentConfig: { ...CONFIG.requestBody }, // Configuración actual
  autoBooking: {
    enabled: false,
    minHour: "09:00",
    idParties: [],
    cookies: [],
    emails: [],   // ← ← ← NUEVA LÍNEA
    currentPartyIndex: 0,
    currentCookieIndex: 0,
    bookedAppointments: []
  }

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

// Función para convertir hora de 12h a 24h
function convertTo24Hour(time12h) {
  const [time, modifier] = time12h.split(' ');
  let [hours, minutes] = time.split(':');

  if (hours === '12') {
    hours = '00';
  }

  if (modifier === 'PM') {
    hours = parseInt(hours, 10) + 12;
  }

  return `${hours.toString().padStart(2, '0')}:${minutes}`;
}

// Función para verificar si la hora es mayor o igual a la hora mínima
function isTimeValid(hora12h, minHour) {
  try {
    const hora24h = convertTo24Hour(hora12h);
    return hora24h >= minHour;
  } catch (error) {
    return false;
  }
}

// Función para hacer el agendamiento automático
async function makeAppointment(schedule, idparty, cookie) {
  try {
    // ✅ CORRECCIÓN: Convertir a números enteros
    const appointmentData = {
      date: state.currentConfig.date,
      idparty: parseInt(idparty), // ← Convertir a int
      idschedule: parseInt(schedule.idschedule), // ← Convertir a int
      status: 1,
      idappointmenttype: 1
    };

    // ✅ VERIFICACIÓN: Asegurar que son números válidos
    if (isNaN(appointmentData.idparty) || isNaN(appointmentData.idschedule)) {
      const errorMessage = `❌ Error: ID Party (${idparty}) o ID Schedule (${schedule.idschedule}) no son números válidos`;
      writeToLog(errorMessage);
      return false;
    }

    const requestBody = JSON.stringify(appointmentData);

    const headers = {
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'en-US,en;q=0.9,es-419;q=0.8,es;q=0.7,pt;q=0.6',
      'Cache-Control': 'no-cache',
      'Content-Type': 'text/plain;charset=UTF-8',
      'Content-Length': Buffer.byteLength(requestBody),
      'Accept': '*/*',
      'Connection': 'keep-alive',
      'Cookie': cookie,
      'Dnt': '1',
      'Host': 'www.italcambio.com',
      'Origin': 'https://www.italcambio.com',
      'Pragma': 'no-cache',
      'Referer': 'https://www.italcambio.com/appointment/application',
      'Sec-Ch-Ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
    };

    writeToLog(`📝 Intentando agendar cita para idparty: ${appointmentData.idparty} (como número) a las ${schedule.hora}`);

    const response = await axios.post(CONFIG.appointmentUrl, appointmentData, {
      headers: headers,
      timeout: 30000,
      validateStatus: function (status) {
        return status >= 200 && status < 500; // Aceptar 2xx y 4xx
      }
    });

    const statusCode = response.status;
    const responseData = response.data;

    writeToLog(`📊 Respuesta del servidor: Status ${statusCode}`);

    // Verificar si la cita se generó exitosamente
    if (responseData && responseData.message && responseData.message.includes('Cita generada exitosamente')) {
      const successMessage = `✅ CITA AGENDADA EXITOSAMENTE - ID Party: ${appointmentData.idparty} - Hora: ${schedule.hora} - ID Schedule: ${appointmentData.idschedule} - Status: ${statusCode}`;
      writeToLog(successMessage);

      // 🔵 PASO 3: Registrar en mngmapmtcustomer.php
      try {
        const payloadMap = {
          appointmentId: appointmentData.idschedule,
          personId: appointmentData.idparty
        };

        const mapResp = await axios.post(
          'https://www.italcambio.com/appointmentAPI/public/security/mngmapmtcustomer.php',
          payloadMap,
          { headers, timeout: 30000 }
        );

        writeToLog(`📌 Registro interno MAP → Status ${mapResp.status} | Respuesta: ${JSON.stringify(mapResp.data)}`);

        if (mapResp.status >= 400) {
          writeToLog(`❌ Error registrando MAP: ${JSON.stringify(mapResp.data)}`);
        }

      } catch (err) {
        writeToLog(`❌ Error en MAP: ${err.message}`);
      }



      // 🔵 PASO 4: Enviar correo mngmapmtcustomerEmail.php
      try {
        const payloadEmail = {
          appointmentId: appointmentData.idschedule,
          personId: appointmentData.idparty,
          locationId: state.currentConfig.idlocation,
          email: state.autoBooking.email || 'josevega1999.16@gmail.com'
        };

        const emailResp = await axios.post(
          'https://www.italcambio.com/appointmentAPI/public/security/mngmapmtcustomerEmail.php',
          payloadEmail,
          { headers, timeout: 30000 }
        );

        writeToLog(`📨 Email enviado → Status ${emailResp.status} | Respuesta: ${JSON.stringify(emailResp.data)}`);

        if (emailResp.status >= 400) {
          writeToLog(`❌ Error enviando email: ${JSON.stringify(emailResp.data)}`);
        }

      } catch (err) {
        writeToLog(`❌ Error en envío de email: ${err.message}`);
      }


      // Guardar en estado
      state.autoBooking.bookedAppointments.push({
        idparty: appointmentData.idparty,
        hora: schedule.hora,
        idschedule: appointmentData.idschedule,
        fecha: state.currentConfig.date,
        timestamp: getVenezuelaTime(),
        statusCode: statusCode
      });

      return true;
    } else if (statusCode === 200 || statusCode === 201) {
      const warningMessage = `⚠️ Agendamiento con status ${statusCode} pero mensaje inesperado - ID Party: ${appointmentData.idparty} - Respuesta: ${JSON.stringify(responseData)}`;
      writeToLog(warningMessage);
      return false;
    } else {
      const errorMessage = `❌ Error en agendamiento (${statusCode}) - ID Party: ${appointmentData.idparty} - Respuesta: ${JSON.stringify(responseData)}`;
      writeToLog(errorMessage);
      return false;
    }

  } catch (error) {
    // Solo debería entrar aquí por errores de red o timeout
    if (error.response) {
      const responseData = error.response.data;
      const statusCode = error.response.status;

      const errorMessage = `❌ Error inesperado (${statusCode}) - ID Party: ${idparty} - Respuesta: ${JSON.stringify(responseData)}`;
      writeToLog(errorMessage);
    } else if (error.request) {
      const errorMessage = `❌ Error de red en agendamiento - ID Party: ${idparty} - Error: ${error.message}`;
      writeToLog(errorMessage);
    } else {
      const errorMessage = `❌ Error de configuración en agendamiento - ID Party: ${idparty} - Error: ${error.message}`;
      writeToLog(errorMessage);
    }

    return false;
  }
}

// Función para procesar disponibilidad y agendar
async function processAvailability(responseData) {
  if (!state.autoBooking.enabled || !Array.isArray(responseData)) {
    return;
  }

  // Filtrar horarios válidos (mayores o iguales a la hora mínima)
  const validSchedules = responseData.filter(schedule =>
    schedule.idschedule &&
    schedule.hora &&
    isTimeValid(schedule.hora, state.autoBooking.minHour)
  );

  if (validSchedules.length === 0) {
    writeToLog(`⏰ Horarios disponibles no cumplen con la hora mínima (${state.autoBooking.minHour})`);
    return;
  }

  writeToLog(`🎯 ${validSchedules.length} horario(s) válido(s) encontrado(s) para agendamiento`);

  // ✅ CORRECCIÓN: Solo agendar para el PRIMER idparty disponible
  if (state.autoBooking.idParties.length > 0 && state.autoBooking.cookies.length > 0) {
    const idparty = state.autoBooking.idParties[0]; // Solo el primero
    const cookie = state.autoBooking.cookies[state.autoBooking.currentCookieIndex];

    // Intentar con el primer horario disponible
    const schedule = validSchedules[0];
    const success = await makeAppointment(schedule, idparty, cookie);

    if (success) {
      // ✅ CORRECCIÓN: Remover SOLO el idparty usado
      state.autoBooking.idParties.shift(); // Remover el primero

      // ✅ CORRECCIÓN: Rotar cookie para el próximo
      state.autoBooking.currentCookieIndex =
        (state.autoBooking.currentCookieIndex + 1) % state.autoBooking.cookies.length;

      writeToLog(`✅ ID Party ${idparty} agendado exitosamente. Restantes: ${state.autoBooking.idParties.length}`);

      // Si no quedan más idparties, desactivar auto-booking
      if (state.autoBooking.idParties.length === 0) {
        writeToLog('🏁 Todos los idparties han sido agendados. Auto-booking desactivado.');
        state.autoBooking.enabled = false;
      }
    } else {
      writeToLog(`❌ Falló agendamiento para ID Party ${idparty}. Se reintentará en la próxima disponibilidad.`);
    }
  } else {
    writeToLog('⚠️ No hay ID Parties o Cookies configurados para auto-booking');
  }
}

// Función para hacer la solicitud POST
async function makeRequest() {
  if (!state.isRunning) return;

  try {
    const requestBody = JSON.stringify(state.currentConfig); // ← Esto es lo que falta

    const response = await axios.post(CONFIG.targetUrl, state.currentConfig, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody), // ← Ahora requestBody está definido
        'Accept': '*/*',
        'Connection': 'keep-alive',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 30000
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

      // Procesar disponibilidad para auto-booking
      if (Array.isArray(response.data)) {
        await processAvailability(response.data);
      }
    }

  } catch (error) {
    const venezuelaTime = getVenezuelaTime();
    // Solo loguear errores que NO sean 400/404
    if (!error.message.includes('400') && !error.message.includes('404') && !error.message.includes('Bad Request')) {
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
            max-width: 1400px; 
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
        .success { 
            background: #d4edda; 
            padding: 15px; 
            border-radius: 5px; 
            margin-bottom: 20px;
            border-left: 4px solid #28a745;
        }
        .config-form {
            background: #e3f2fd;
            padding: 20px;
            border-radius: 5px;
            margin-bottom: 20px;
            border-left: 4px solid #2196F3;
        }
        .auto-booking-form {
            background: #fff3e0;
            padding: 20px;
            border-radius: 5px;
            margin-bottom: 20px;
            border-left: 4px solid #FF9800;
        }
        .form-group {
            margin-bottom: 15px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        input, select, textarea {
            width: 100%;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
        }
        textarea {
            height: 80px;
            resize: vertical;
        }
        button {
            background: #2196F3;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            margin-right: 10px;
            margin-bottom: 5px;
        }
        button:hover {
            background: #1976D2;
        }
        .btn-success { background: #28a745; }
        .btn-success:hover { background: #218838; }
        .btn-danger { background: #dc3545; }
        .btn-danger:hover { background: #c82333; }
        .btn-warning { background: #ffc107; color: #000; }
        .btn-warning:hover { background: #e0a800; }
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
        .auto-booking-status {
            background: #e8f5e8;
            padding: 10px;
            border-radius: 5px;
            margin-bottom: 10px;
            border-left: 4px solid #4CAF50;
        }
        .booked-appointments {
            background: #d4edda;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
            border-left: 4px solid #28a745;
        }
        .appointment-item {
            background: white;
            padding: 10px;
            margin: 5px 0;
            border-radius: 4px;
            border-left: 4px solid #28a745;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Monitor de Italcambio</h1>
        
        <!-- Controles principales -->
        <div style="margin-bottom: 20px;">
            ${state.isRunning ?
      `<form action="/stop-monitor" method="POST" style="display: inline;">
                    <button type="submit" class="btn-danger">⏹️ Detener Monitor</button>
                </form>` :
      `<form action="/start-monitor" method="POST" style="display: inline;">
                    <button type="submit" class="btn-success">▶️ Iniciar Monitor</button>
                </form>`
    }
            <form action="/clear-counters" method="POST" style="display: inline;">
                <button type="submit" class="btn-warning">🔄 Reiniciar Contadores</button>
            </form>
        </div>
        
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
                        <option value="12" ${state.currentConfig.idlocation == 12 ? 'selected' : ''}>Galería Fente (12)</option>
                        <option value="62" ${state.currentConfig.idlocation == 62 ? 'selected' : ''}>Sambil (62)</option>
                        <option value="11" ${state.currentConfig.idlocation == 11 ? 'selected' : ''}>Aeropuerto (11)</option>
                    </select>
                </div>
                <button type="submit">Actualizar Configuración</button>
            </form>
        </div>

        <!-- Formulario de Auto-Booking -->
        <div class="auto-booking-form">
            <h3>🤖 Auto-Booking Automático</h3>
            <form action="/update-auto-booking" method="POST">
                <div class="form-group">
                    <label>
                        <input type="checkbox" name="enabled" ${state.autoBooking.enabled ? 'checked' : ''}>
                        Activar Auto-Booking
                    </label>
                </div>
                <div class="form-group">
                    <label for="minHour">Hora Mínima (HH:MM 24h):</label>
                    <input type="text" id="minHour" name="minHour" 
                           value="${state.autoBooking.minHour}" 
                           placeholder="09:00" pattern="[0-9]{2}:[0-9]{2}">
                    <small>Formato 24h (ej: 09:00, 13:30)</small>
                </div>
                <div class="form-group">
                    <label for="idParties">ID Parties (uno por línea):</label>
                    <textarea id="idParties" name="idParties" placeholder="Ejemplo:&#10;12345&#10;67890">${state.autoBooking.idParties.join('\n')}</textarea>
                    <small>Ingresa uno o más ID Parties, uno por línea</small>
                </div>
                <div class="form-group">
                    <label for="cookies">Cookies (una por línea):</label>
                    <textarea id="cookies" name="cookies" placeholder="Ejemplo:&#10;PHPSESSID=abc123...&#10;PHPSESSID=def456...">${state.autoBooking.cookies.join('\n')}</textarea>
                    <small>Ingresa una o más cookies de sesión, una por línea</small>
                </div>
                <div class="form-group">
                    <label for="emails">Emails (uno por línea):</label>
                    <textarea id="emails" name="emails" placeholder="Ejemplo:&#10;correo1@example.com&#10;correo2@example.com">${state.autoBooking.emails.join('\n')}</textarea>
                    <small>Ingresa uno o más correos, uno por línea</small>
                </div>

                <button type="submit" class="btn-success">💾 Guardar Configuración Auto-Booking</button>
            </form>
        </div>

        <div class="current-config">
            <strong>📋 Configuración Actual:</strong><br>
            <strong>Ubicación:</strong> ${state.currentConfig.idlocation} | 
            <strong>Fecha:</strong> ${state.currentConfig.date} |
            <strong>Auto-Booking:</strong> ${state.autoBooking.enabled ? '🟢 ACTIVADO' : '🔴 DESACTIVADO'} |
            <strong>Hora Mínima:</strong> ${state.autoBooking.minHour} |
            <strong>ID Parties Restantes:</strong> ${state.autoBooking.idParties.length} |
            <strong>Cookies Disponibles:</strong> ${state.autoBooking.cookies.length}
        </div>
        
        ${state.autoBooking.bookedAppointments.length > 0 ? `
        <div class="booked-appointments">
            <h3>✅ Citas Agendadas Exitosamente</h3>
            ${state.autoBooking.bookedAppointments.map(appt => `
                <div class="appointment-item">
                    <strong>ID Party:</strong> ${appt.idparty} | 
                    <strong>Fecha:</strong> ${appt.fecha} | 
                    <strong>Hora:</strong> ${appt.hora} |
                    <strong>Agendado:</strong> ${appt.timestamp}
                </div>
            `).join('')}
        </div>
        ` : ''}
        
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
                <div class="stat-number">${state.autoBooking.bookedAppointments.length}</div>
                <div>Citas Agendadas</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${hours}h ${minutes}m ${seconds}s</div>
                <div>Tiempo Activo</div>
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
      if (log.includes('✅') || log.includes('CITA AGENDADA')) cssClass = 'log-success';
      if (log.includes('📝') || log.includes('Intentando agendar')) cssClass = 'log-info';

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

// Ruta para actualizar auto-booking
app.post('/update-auto-booking', (req, res) => {
  const { enabled, minHour, idParties, cookies, emails } = req.body;

  state.autoBooking.enabled = enabled === 'on';
  state.autoBooking.minHour = minHour || "09:00";

  // ✅ CORRECCIÓN: Convertir ID Parties a números
  state.autoBooking.idParties = idParties
    ? idParties.split('\n')
      .map(party => party.trim())
      .filter(party => party !== '')
      .map(party => parseInt(party)) // ← Convertir a números
      .filter(party => !isNaN(party)) // ← Filtrar solo números válidos
    : [];

  // Procesar cookies
  state.autoBooking.cookies = cookies
    ? cookies.split('\n').map(cookie => cookie.trim()).filter(cookie => cookie !== '')
    : [];

  // Procesar emails (uno por línea)
  state.autoBooking.emails = emails
    ? emails.split('\n')
      .map(email => email.trim())
      .filter(email => email !== '')
    : [];


  // Reiniciar índices
  state.autoBooking.currentPartyIndex = 0;
  state.autoBooking.currentCookieIndex = 0;

  const statusMessage = state.autoBooking.enabled ? 'activado' : 'desactivado';
  const validParties = state.autoBooking.idParties.length;
  const totalParties = idParties ? idParties.split('\n').filter(party => party.trim() !== '').length : 0;

  const changeMessage = `⚙️ AUTO-BOOKING ${statusMessage.toUpperCase()} - Hora mínima: ${state.autoBooking.minHour} - ID Parties válidos: ${validParties}/${totalParties} - Cookies: ${state.autoBooking.cookies.length}`;
  writeToLog(changeMessage);

  // Mostrar advertencia si hay IDs inválidos
  if (validParties < totalParties) {
    writeToLog(`⚠️ Se ignoraron ${totalParties - validParties} ID Parties inválidos (no son números)`);
  }

  res.redirect('/?success=Configuración de auto-booking actualizada');
});

// Ruta para detener monitor
app.post('/stop-monitor', (req, res) => {
  state.isRunning = false;
  writeToLog('⏹️ MONITOR DETENIDO MANUALMENTE');
  res.redirect('/?success=Monitor detenido');
});

// Ruta para iniciar monitor
app.post('/start-monitor', (req, res) => {
  state.isRunning = true;
  writeToLog('▶️ MONITOR INICIADO MANUALMENTE');

  // Reiniciar el bucle de monitoreo si no está corriendo
  if (!state.monitorRunning) {
    startMonitor().catch(error => {
      console.error('Error al reiniciar monitor:', error);
    });
  }

  res.redirect('/?success=Monitor iniciado');
});

// Ruta para reiniciar contadores
app.post('/clear-counters', (req, res) => {
  state.totalRequests = 0;
  state.totalChanges = 0;
  state.requestCount = 0;
  state.lastDifferentResponse = null;
  state.lastDifferentResponseTime = null;
  state.autoBooking.bookedAppointments = [];

  writeToLog('🔄 CONTADORES REINICIADOS MANUALMENTE');
  res.redirect('/?success=Contadores reiniciados');
});

// APIs
app.get('/api/status', (req, res) => {
  res.json({
    status: state.isRunning ? 'running' : 'stopped',
    startTime: state.startTime,
    totalRequests: state.totalRequests,
    totalChanges: state.totalChanges,
    lastChange: state.lastDifferentResponseTime,
    lastResponse: state.lastDifferentResponse,
    currentConfig: state.currentConfig,
    autoBooking: state.autoBooking,
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

  // Marcar que el monitor está corriendo
  state.monitorRunning = true;

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
  state.monitorRunning = false;
  writeToLog('Monitor detenido por el usuario');
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Monitor detenido por el sistema');
  state.isRunning = false;
  state.monitorRunning = false;
  writeToLog('Monitor detenido por el sistema');
  setTimeout(() => {
    process.exit(0);
  }, 1000);
});