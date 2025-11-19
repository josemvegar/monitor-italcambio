const express = require('express');
const app = express();
const PORT = 3001;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Estados de testing
let testMode = 'random';
let responseCount = 0;
let lastAppointmentAttempt = null;

// Middleware para loguear todas las requests
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path}`);
  if (Object.keys(req.body).length > 0) {
    console.log('📦 Body:', req.body);
  }
  next();
});

// Simular endpoint de disponibilidad
app.post('/appointmentAPI/public/exchange/availaptmentbyhour.php', (req, res) => {
  responseCount++;
  
  let responseData;
  
  if (testMode === 'no-availability') {
    responseData = { "message": "Sin Disponibilidad" };
  } 
  else if (testMode === 'availability') {
    responseData = [
      {"idschedule":36523,"idfecha":"19/11/2025","hora":"08:00 AM","capacidaddisponible":2},
      {"idschedule":36524,"idfecha":"19/11/2025","hora":"09:00 AM","capacidaddisponible":2},
      {"idschedule":36525,"idfecha":"19/11/2025","hora":"10:00 AM","capacidaddisponible":2}
    ];
  }
  else if (testMode === 'random') {
    if (responseCount % 5 === 0) { // Cada 5 requests, dar disponibilidad
      responseData = [
        {"idschedule":36523 + responseCount,"idfecha":"19/11/2025","hora":"08:00 AM","capacidaddisponible":1},
        {"idschedule":36524 + responseCount,"idfecha":"19/11/2025","hora":"09:00 AM","capacidaddisponible":1}
      ];
      console.log(`🎯 [DISPO] Enviando disponibilidad (count: ${responseCount})`);
    } else {
      responseData = { "message": "Sin Disponibilidad" };
    }
  }
  else {
    responseData = { "message": "Sin Disponibilidad" };
  }
  
  console.log(`📡 Disponibilidad: ${Array.isArray(responseData) ? 'SI' : 'NO'} (${testMode})`);
  res.json(responseData);
});

// Simular endpoint de agendamiento
app.post('/appointmentAPI/public/exchange/appointment.php', (req, res) => {
  lastAppointmentAttempt = {
    body: req.body,
    timestamp: new Date().toISOString()
  };
  
  console.log('📝 INTENTO DE AGENDAMIENTO RECIBIDO:');
  console.log('   ID Party:', req.body.idparty);
  console.log('   ID Schedule:', req.body.idschedule);
  console.log('   Hora:', req.body.date);
  console.log('   Cookie recibida:', req.headers.cookie ? 'SI' : 'NO');
  
  let responseData;
  
  if (testMode === 'booking-success') {
    responseData = {
      "message": "Cita generada exitosamente",
      "info": "OK",
      "idappointment": 1000 + Math.floor(Math.random() * 1000),
      "statuscode": 200
    };
    console.log('✅ SIMULANDO AGENDAMIENTO EXITOSO');
  }
  else if (testMode === 'booking-failed') {
  // En modo booking-failed, SIEMPRE dar disponibilidad pero el agendamiento falla
  responseData = [
    {"idschedule":36523,"idfecha":"19/11/2025","hora":"08:00 AM","capacidaddisponible":2},
    {"idschedule":36524,"idfecha":"19/11/2025","hora":"09:00 AM","capacidaddisponible":2},
    {"idschedule":36525,"idfecha":"19/11/2025","hora":"10:00 AM","capacidaddisponible":2}
  ];
  console.log(`🎯 [DISPO] Forzando disponibilidad para testing de errores`);
}
  else if (testMode === 'random') {
    if (Math.random() > 0.3) {
      responseData = {
        "message": "Cita generada exitosamente",
        "info": "OK", 
        "idappointment": 2000 + Math.floor(Math.random() * 1000),
        "statuscode": 200
      };
      console.log('✅ SIMULANDO AGENDAMIENTO EXITOSO (random)');
    } else {
      responseData = {
        "error": "No se pudo generar cita", 
        "info": "No se agendo. Cupos Agotados",
        "idappointment": 0,
        "statuscode": 400
      };
      console.log('❌ SIMULANDO AGENDAMIENTO FALLIDO (random)');
    }
  }
  else {
    responseData = {
      "message": "Cita generada exitosamente",
      "info": "OK",
      "idappointment": 3000 + Math.floor(Math.random() * 1000),
      "statuscode": 200
    };
    console.log('✅ SIMULANDO AGENDAMIENTO EXITOSO (default)');
  }
  
  res.json(responseData);
});

// Endpoint para cambiar modo de test
app.get('/test-mode/:mode', (req, res) => {
  const mode = req.params.mode;
  const validModes = ['no-availability', 'availability', 'booking-success', 'booking-failed', 'random'];
  
  if (validModes.includes(mode)) {
    testMode = mode;
    responseCount = 0;
    console.log(`\n🔄 MODO CAMBIADO: ${mode}`);
    res.json({ success: true, mode: testMode });
  } else {
    res.status(400).json({ error: 'Modo inválido', validModes });
  }
});

// Endpoint para ver estado actual
app.get('/test-status', (req, res) => {
  res.json({
    testMode: testMode,
    responseCount: responseCount,
    lastAppointmentAttempt: lastAppointmentAttempt,
    endpoints: {
      availability: 'POST /appointmentAPI/public/exchange/availaptmentbyhour.php',
      appointment: 'POST /appointmentAPI/public/exchange/appointment.php'
    }
  });
});

// Endpoint para forzar disponibilidad
app.get('/force-availability', (req, res) => {
  testMode = 'availability';
  responseCount = 0;
  console.log('\n🎯 FORZANDO DISPONIBILIDAD INMEDIATA');
  res.json({ success: true, message: 'Modo cambiado a disponibilidad forzada' });
});

app.listen(PORT, () => {
  console.log(`🧪 SERVIDOR DE TESTING en http://localhost:${PORT}`);
  console.log('\n📋 COMANDOS RÁPIDOS:');
  console.log('   http://localhost:3001/test-mode/availability     - Siempre con disponibilidad');
  console.log('   http://localhost:3001/test-mode/booking-success  - Siempre agendamiento exitoso');
  console.log('   http://localhost:3001/test-mode/random           - Comportamiento realista');
  console.log('   http://localhost:3001/force-availability         - Forzar disponibilidad inmediata');
  console.log('   http://localhost:3001/test-status                - Ver estado actual');
  console.log('\n⚡ Modo actual: ' + testMode);
  console.log('📍 El monitor debe apuntar a: http://localhost:3001');
});