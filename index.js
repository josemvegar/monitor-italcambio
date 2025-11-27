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
  generalAvailabilityUrl: TEST_MODE
    ? 'http://localhost:3001/appointmentAPI/public/exchange/availaptment.php'
    : 'https://www.italcambio.com/appointmentAPI/public/exchange/availaptment.php',
  
  hourlyAvailabilityUrl: TEST_MODE
    ? 'http://localhost:3001/appointmentAPI/public/exchange/availaptmentbyhour.php'
    : 'https://www.italcambio.com/appointmentAPI/public/exchange/availaptmentbyhour.php',
  
  amountCheckUrl: TEST_MODE
    ? 'http://localhost:3001/appointmentAPI/public/exchange/amountclientbyinterval.php'
    : 'https://www.italcambio.com/appointmentAPI/public/exchange/amountclientbyinterval.php',
  
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

// Función para verificar el monto del cliente
async function checkAmount(idparty, date, cookie) {
  try {
    const payload = {
      idparty: parseInt(idparty),
      date: date
    };

    const requestBody = JSON.stringify(payload);

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

    writeToLog(`💰 Verificando monto para ID Party: ${idparty}`);

    const response = await axios.post(CONFIG.amountCheckUrl, payload, {
      headers: headers,
      timeout: 30000,
      validateStatus: function (status) {
        return status >= 200 && status < 500;
      }
    });

    const statusCode = response.status;
    const responseData = response.data;

    if (statusCode === 200 && Array.isArray(responseData) && responseData[0] && responseData[0].amount === 100) {
      writeToLog(`✅ Monto verificado: $${responseData[0].amount}`);
      return true;
    } else {
      writeToLog(`❌ Monto inválido o error: ${JSON.stringify(responseData)} - Status: ${statusCode}`);
      return false;
    }

  } catch (error) {
    writeToLog(`❌ Error verificando monto: ${error.message}`);
    return false;
  }
}

// Función para hacer el agendamiento automático
async function makeAppointment(schedule, idparty, cookie) {
  try {
    // ✅ CORRECCIÓN: Payload en el orden exacto del frontend
    const appointmentData = {
      date: state.currentConfig.date,
      idparty: parseInt(idparty),
      idschedule: parseInt(schedule.idschedule),
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

    writeToLog(`📝 Intentando agendar cita para idparty: ${appointmentData.idparty} a las ${schedule.hora}`);

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

    // ✅ CORRECCIÓN: Verificar ambos mensajes de éxito (200 y 400)
    const successMessages = [
      'Confirmación de su cita ha sido enviado exitosamente',
      'Cita generada exitosamente',
      'exitosamente'
    ];

    const isSuccess = responseData && responseData.message && 
      successMessages.some(msg => responseData.message.includes(msg));

    if (isSuccess) {
      const successMessage = `✅ CITA AGENDADA EXITOSAMENTE - ID Party: ${appointmentData.idparty} - Hora: ${schedule.hora} - ID Schedule: ${appointmentData.idschedule} - Status: ${statusCode}`;
      writeToLog(successMessage);
      writeToLog(`📨 Mensaje: ${responseData.message}`);

      // Guardar en estado
      state.autoBooking.bookedAppointments.push({
        idparty: appointmentData.idparty,
        hora: schedule.hora,
        idschedule: appointmentData.idschedule,
        fecha: state.currentConfig.date,
        timestamp: getVenezuelaTime(),
        statusCode: statusCode,
        message: responseData.message
      });

      return true;
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

      // ✅ CORRECCIÓN: Verificar éxito incluso en errores HTTP
      const successMessages = [
        'Confirmación de su cita ha sido enviado exitosamente',
        'Cita generada exitosamente',
        'exitosamente'
      ];

      const isSuccess = responseData && responseData.message && 
        successMessages.some(msg => responseData.message.includes(msg));

      if (isSuccess) {
        const successMessage = `✅ CITA AGENDADA EXITOSAMENTE (a pesar del ${statusCode}) - ID Party: ${idparty} - Mensaje: ${responseData.message}`;
        writeToLog(successMessage);

        state.autoBooking.bookedAppointments.push({
          idparty: parseInt(idparty),
          hora: schedule.hora,
          idschedule: parseInt(schedule.idschedule),
          fecha: state.currentConfig.date,
          timestamp: getVenezuelaTime(),
          statusCode: statusCode,
          message: responseData.message
        });

        return true;
      } else {
        const errorMessage = `❌ Error inesperado (${statusCode}) - ID Party: ${idparty} - Respuesta: ${JSON.stringify(responseData)}`;
        writeToLog(errorMessage);
      }
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

// Función para obtener disponibilidad por hora
async function getHourlyAvailability() {
  try {
    const payload = {
      idlocation: state.currentConfig.idlocation,
      date: state.currentConfig.date
    };

    const requestBody = JSON.stringify(payload);

    const response = await axios.post(CONFIG.hourlyAvailabilityUrl, payload, {
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        'Content-Length': Buffer.byteLength(requestBody),
        'Accept': '*/*',
        'Connection': 'keep-alive',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 30000
    });

    return response.data;
  } catch (error) {
    writeToLog(`❌ Error obteniendo disponibilidad por hora: ${error.message}`);
    return null;
  }
}

// Función para procesar disponibilidad y agendar
async function processAvailability(responseData) {
  if (!state.autoBooking.enabled || !Array.isArray(responseData)) {
    return;
  }

  // 1. Primero obtener disponibilidad por hora
  const hourlyAvailability = await getHourlyAvailability();
  
  if (!hourlyAvailability || !Array.isArray(hourlyAvailability)) {
    writeToLog('❌ No se pudo obtener la disponibilidad por hora');
    return;
  }

  writeToLog(`📅 Disponibilidad por hora obtenida: ${hourlyAvailability.length} horarios`);

  // Filtrar horarios válidos (mayores o iguales a la hora mínima)
  const validSchedules = hourlyAvailability.filter(schedule =>
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

    // 2. Verificar monto antes de agendar
    const amountValid = await checkAmount(idparty, state.currentConfig.date, cookie);
    
    if (!amountValid) {
      writeToLog(`❌ Monto no válido para ID Party ${idparty}. Saltando agendamiento.`);
      return;
    }

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

// Función para hacer la solicitud POST (disponibilidad general)
async function makeRequest() {
  if (!state.isRunning) return;

  try {
    const payload = {
      idlocation: state.currentConfig.idlocation
    };

    const requestBody = JSON.stringify(payload);

    const response = await axios.post(CONFIG.generalAvailabilityUrl, payload, {
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        'Content-Length': Buffer.byteLength(requestBody),
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
      !Array.isArray(response.data) || // Si no es un array
      response.data.length === 0 || // Si está vacío
      (response.data[0] && response.data[0].capacidaddisponible > 0); // Si hay capacidad disponible

    if (hasDifferentResponse) {
      const venezuelaTime = getVenezuelaTime();
      state.totalChanges++;

      const alertMessage = `🚨 DISPONIBILIDAD ENCONTRADA - ${venezuelaTime}`;
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
      if (Array.isArray(response.data) && response.data.length > 0) {
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

// El resto del código (Express routes, formularios, etc.) permanece igual...
// [MANTENGO EL RESTO DEL CÓDIGO SIN CAMBIOS PARA NO HACER EL MENSAJE DEMASIADO LARGO]