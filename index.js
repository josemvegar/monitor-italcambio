const axios = require('axios');
const moment = require('moment-timezone');

// Configuración
const CONFIG = {
  targetUrl: 'https://www.italcambio.com/appointmentAPI/public/exchange/availaptmentbyhour.php',
  requestBody: {
    idlocation: 12,
    date: '15/11/2025'
  },
  checkInterval: 1000, // 1 segundo entre llamadas
  logInterval: 60 * 60 * 1000, // 1 hora en milisegundos
  timezone: 'America/Caracas'
};

// Estado del monitor
let state = {
  lastDifferentResponse: null,
  lastDifferentResponseTime: null,
  requestCount: 0,
  lastLogTime: Date.now(),
  hourWithoutChanges: true
};

// Función para obtener la hora actual de Venezuela
function getVenezuelaTime() {
  return moment().tz(CONFIG.timezone).format('YYYY-MM-DD HH:mm:ss');
}

// Función para hacer la solicitud POST
async function makeRequest() {
  try {
    const response = await axios.post(CONFIG.targetUrl, CONFIG.requestBody, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });

    state.requestCount++;
    
    // Verificar si la respuesta es diferente a "Sin Disponibilidad"
    if (response.data.message !== "Sin Disponibilidad") {
      const venezuelaTime = getVenezuelaTime();
      
      console.log(`🚨 RESPUESTA DIFERENTE ENCONTRADA - ${venezuelaTime}`);
      console.log('📦 Respuesta completa:', JSON.stringify(response.data, null, 2));
      console.log('---');
      
      // Actualizar estado
      state.lastDifferentResponse = response.data;
      state.lastDifferentResponseTime = venezuelaTime;
      state.hourWithoutChanges = false;
    }
    
    // Verificar si es hora de hacer log (cada hora)
    const now = Date.now();
    if (now - state.lastLogTime >= CONFIG.logInterval) {
      const venezuelaTime = getVenezuelaTime();
      
      if (state.hourWithoutChanges) {
        console.log(`📊 [LOG HORARIO] ${venezuelaTime} - ${state.requestCount} solicitudes realizadas - Sin cambios en la última hora`);
      } else {
        console.log(`🎯 [LOG HORARIO] ${venezuelaTime} - ${state.requestCount} solicitudes realizadas - Se encontraron cambios durante esta hora`);
        console.log(`🕐 Último cambio: ${state.lastDifferentResponseTime}`);
      }
      
      // Reiniciar contadores para la próxima hora
      state.lastLogTime = now;
      state.requestCount = 0;
      state.hourWithoutChanges = true;
    }
    
  } catch (error) {
    const venezuelaTime = getVenezuelaTime();
    console.error(`❌ ERROR [${venezuelaTime}]:`, error.message);
    
    // Si es un error de timeout, esperar un poco más antes del próximo intento
    if (error.code === 'ECONNABORTED') {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// Función principal del monitor
async function startMonitor() {
  console.log('🚀 Iniciando monitor de Italcambio...');
  console.log('📍 Ubicación:', CONFIG.requestBody.idlocation);
  console.log('📅 Fecha:', CONFIG.requestBody.date);
  console.log('⏰ Zona horaria:', CONFIG.timezone);
  console.log('🔁 Intervalo de verificación:', CONFIG.checkInterval, 'ms');
  console.log('📝 Log cada:', CONFIG.logInterval / 1000 / 60, 'minutos');
  console.log('=' .repeat(50));
  
  // Bucle infinito de monitoreo
  while (true) {
    await makeRequest();
    await new Promise(resolve => setTimeout(resolve, CONFIG.checkInterval));
  }
}

// Manejo de cierre graceful
process.on('SIGINT', () => {
  console.log('\n🛑 Deteniendo monitor...');
  console.log('¡Hasta luego!');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Monitor detenido por el sistema');
  process.exit(0);
});

// Iniciar la aplicación
startMonitor().catch(error => {
  console.error('Error fatal:', error);
  process.exit(1);
});