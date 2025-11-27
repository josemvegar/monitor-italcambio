const express = require('express');
const app = express();
const PORT = 3001;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Estados de testing
let testMode = 'random';
let responseCount = 0;
let lastAppointmentAttempt = null;
let timeoutEnabled = false;
let networkErrorEnabled = false;

// Middleware para loguear todas las requests
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path}`);
  if (Object.keys(req.body).length > 0) {
    console.log('📦 Body:', req.body);
  }
  next();
});

// 1. Endpoint de disponibilidad general
app.post('/appointmentAPI/public/exchange/availaptment.php', (req, res) => {
  responseCount++;
  
  // Simular timeout
  if (timeoutEnabled && Math.random() > 0.8) {
    console.log('⏰ [TIMEOUT] Simulando timeout en disponibilidad general');
    setTimeout(() => {
      res.status(408).json({ error: "Request Timeout" });
    }, 100);
    return;
  }
  
  // Simular error de red
  if (networkErrorEnabled && Math.random() > 0.9) {
    console.log('🌐 [NETWORK ERROR] Simulando error de red en disponibilidad general');
    res.status(503).json({ error: "Service Unavailable" });
    return;
  }
  
  let responseData;
  let statusCode = 200;
  
  if (testMode === 'no-availability') {
    responseData = [];
    console.log(`📡 [DISPO GENERAL] Sin disponibilidad - 200`);
  } 
  else if (testMode === 'availability-general-only') {
    responseData = [
      {"fecha":"27/11/2025","capacidaddisponible":3}
    ];
    console.log(`🎯 [DISPO GENERAL] Solo disponibilidad general - 200`);
  }
  else if (testMode === 'availability' || testMode === 'booking-success' || testMode === 'booking-failed' || testMode === 'invalid-amount') {
    responseData = [
      {"fecha":"27/11/2025","capacidaddisponible":3}
    ];
    console.log(`🎯 [DISPO GENERAL] Forzando disponibilidad (modo: ${testMode}) - 200`);
  }
  else if (testMode === 'random') {
    if (responseCount % 5 === 0) {
      responseData = [
        {"fecha":"27/11/2025","capacidaddisponible":2}
      ];
      console.log(`🎯 [DISPO GENERAL] Enviando disponibilidad (count: ${responseCount}) - 200`);
    } else {
      responseData = [];
      console.log(`📡 [DISPO GENERAL] Sin disponibilidad (random) - 200`);
    }
  }
  else {
    responseData = [];
    console.log(`📡 [DISPO GENERAL] Sin disponibilidad (default) - 200`);
  }
  
  res.status(statusCode).json(responseData);
});

// 2. Endpoint de disponibilidad por hora
app.post('/appointmentAPI/public/exchange/availaptmentbyhour.php', (req, res) => {
  // Simular timeout
  if (timeoutEnabled && Math.random() > 0.8) {
    console.log('⏰ [TIMEOUT] Simulando timeout en disponibilidad por hora');
    setTimeout(() => {
      res.status(408).json({ error: "Request Timeout" });
    }, 100);
    return;
  }
  
  // Simular error de red
  if (networkErrorEnabled && Math.random() > 0.9) {
    console.log('🌐 [NETWORK ERROR] Simulando error de red en disponibilidad por hora');
    res.status(503).json({ error: "Service Unavailable" });
    return;
  }
  
  let responseData;
  let statusCode = 200;
  
  if (testMode === 'no-availability') {
    responseData = { "message": "Sin Disponibilidad" };
    statusCode = 404;
    console.log(`📡 [DISPO HORA] Sin disponibilidad por hora - 404`);
  } 
  else if (testMode === 'availability-general-only') {
    responseData = { "message": "Sin Disponibilidad" };
    statusCode = 404;
    console.log(`❌ [DISPO HORA] Disponibilidad general pero NO por hora - 404`);
  }
  else if (testMode === 'availability' || testMode === 'booking-success' || testMode === 'booking-failed' || testMode === 'invalid-amount') {
    responseData = [
      {"idschedule":37261,"idfecha":"27/11/2025","hora":"08:00 AM","capacidaddisponible":1},
      {"idschedule":37262,"idfecha":"27/11/2025","hora":"09:00 AM","capacidaddisponible":1},
      {"idschedule":37263,"idfecha":"27/11/2025","hora":"10:00 AM","capacidaddisponible":1}
    ];
    console.log(`🎯 [DISPO HORA] Forzando disponibilidad por hora (modo: ${testMode}) - 200`);
  }
  else if (testMode === 'random') {
    if (Math.random() > 0.3) {
      responseData = [
        {"idschedule":37261,"idfecha":"27/11/2025","hora":"08:00 AM","capacidaddisponible":1},
        {"idschedule":37262,"idfecha":"27/11/2025","hora":"09:00 AM","capacidaddisponible":1}
      ];
      console.log(`🎯 [DISPO HORA] Enviando disponibilidad por hora - 200`);
    } else {
      responseData = { "message": "Sin Disponibilidad" };
      statusCode = 404;
      console.log(`📡 [DISPO HORA] Sin disponibilidad por hora (random) - 404`);
    }
  }
  else {
    responseData = { "message": "Sin Disponibilidad" };
    statusCode = 404;
    console.log(`📡 [DISPO HORA] Sin disponibilidad por hora (default) - 404`);
  }
  
  res.status(statusCode).json(responseData);
});

// 3. Endpoint de verificación de monto
app.post('/appointmentAPI/public/exchange/amountclientbyinterval.php', (req, res) => {
  console.log(`💰 Verificando monto para ID Party: ${req.body.idparty}`);
  
  // Simular timeout
  if (timeoutEnabled && Math.random() > 0.8) {
    console.log('⏰ [TIMEOUT] Simulando timeout en verificación de monto');
    setTimeout(() => {
      res.status(408).json({ error: "Request Timeout" });
    }, 100);
    return;
  }
  
  // Simular error de red
  if (networkErrorEnabled && Math.random() > 0.9) {
    console.log('🌐 [NETWORK ERROR] Simulando error de red en verificación de monto');
    res.status(503).json({ error: "Service Unavailable" });
    return;
  }
  
  let responseData;
  let statusCode = 200;
  
  if (testMode === 'invalid-amount') {
    responseData = [{"amount":50}];
    console.log(`❌ [MONTO] Monto inválido: $50 - 200`);
  }
  else if (testMode === 'booking-failed') {
    responseData = [{"amount":50}];
    console.log(`❌ [MONTO] Monto inválido: $50 - 200`);
  }
  else {
    responseData = [{"amount":100}];
    console.log(`✅ [MONTO] Monto válido: $100 - 200`);
  }
  
  res.status(statusCode).json(responseData);
});

// 4. Endpoint de agendamiento
app.post('/appointmentAPI/public/exchange/appointment.php', (req, res) => {
  lastAppointmentAttempt = {
    body: req.body,
    timestamp: new Date().toISOString()
  };
  
  console.log('📝 INTENTO DE AGENDAMIENTO RECIBIDO:');
  console.log('   ID Party:', req.body.idparty);
  console.log('   ID Schedule:', req.body.idschedule);
  console.log('   Fecha:', req.body.date);
  
  // Simular timeout
  if (timeoutEnabled && Math.random() > 0.8) {
    console.log('⏰ [TIMEOUT] Simulando timeout en agendamiento');
    setTimeout(() => {
      res.status(408).json({ error: "Request Timeout" });
    }, 100);
    return;
  }
  
  // Simular error de red
  if (networkErrorEnabled && Math.random() > 0.9) {
    console.log('🌐 [NETWORK ERROR] Simulando error de red en agendamiento');
    res.status(503).json({ error: "Service Unavailable" });
    return;
  }
  
  let responseData;
  let statusCode;
  
  if (testMode === 'booking-success') {
    responseData = {
      "message": "Confirmación de su cita ha sido enviado exitosamente. Revise su correo y verifique su cita"
    };
    statusCode = 200;
    console.log('✅ SIMULANDO AGENDAMIENTO EXITOSO - 200');
  }
  else if (testMode === 'booking-failed') {
    responseData = {
      "error": "No se pudo generar cita",
      "info": "No se agendo. Cupos Agotados"
    };
    statusCode = 400;
    console.log('❌ SIMULANDO AGENDAMIENTO FALLIDO - 400');
  }
  else if (testMode === 'invalid-amount') {
    responseData = {
      "error": "Monto insuficiente",
      "info": "El monto disponible es menor al requerido"
    };
    statusCode = 400;
    console.log('❌ SIMULANDO ERROR POR MONTO INSUFICIENTE - 400');
  }
  else if (testMode === 'random') {
    const random = Math.random();
    if (random > 0.3) {
      // 70% éxito - mezcla de 200 y 400 con mensaje de éxito
      if (random > 0.65) {
        responseData = {
          "message": "Confirmación de su cita ha sido enviado exitosamente. Revise su correo y verifique su cita"
        };
        statusCode = 200;
        console.log('✅ SIMULANDO AGENDAMIENTO EXITOSO (200) - random');
      } else {
        responseData = {
          "message": "Confirmación de su cita ha sido enviado exitosamente. Revise su correo y verifique su cita"
        };
        statusCode = 400; // ¡Éxito pero con status 400!
        console.log('⚠️ SIMULANDO AGENDAMIENTO EXITOSO PERO CON 400 - random');
      }
    } else {
      // 30% fallo real
      responseData = {
        "error": "No se pudo generar cita", 
        "info": "No se agendo. Cupos Agotados"
      };
      statusCode = 400;
      console.log('❌ SIMULANDO AGENDAMIENTO FALLIDO (400) - random');
    }
  }
  else {
    responseData = {
      "message": "Confirmación de su cita ha sido enviado exitosamente. Revise su correo y verifique su cita"
    };
    statusCode = 200;
    console.log('✅ SIMULANDO AGENDAMIENTO EXITOSO (200) - default');
  }
  
  res.status(statusCode).json(responseData);
});

// Endpoint para cambiar modo de test
app.get('/test-mode/:mode', (req, res) => {
  const mode = req.params.mode;
  const validModes = [
    'no-availability', 
    'availability-general-only',
    'availability', 
    'booking-success', 
    'booking-failed',
    'invalid-amount',
    'random'
  ];
  
  if (validModes.includes(mode)) {
    testMode = mode;
    responseCount = 0;
    console.log(`\n🔄 MODO CAMBIADO: ${mode}`);
    console.log(`📝 Ahora el comportamiento será:`);
    
    if (mode === 'no-availability') {
      console.log('   • Disponibilidad general: [] (200)');
      console.log('   • Disponibilidad por hora: 404');
      console.log('   • Resultado: Solo monitoreo');
    }
    else if (mode === 'availability-general-only') {
      console.log('   • Disponibilidad general: SI (200)');
      console.log('   • Disponibilidad por hora: 404');
      console.log('   • Resultado: Gap entre endpoints detectado');
    }
    else if (mode === 'availability') {
      console.log('   • Disponibilidad general: SI (200)');
      console.log('   • Disponibilidad por hora: SI (200)');
      console.log('   • Monto: $100 (200)');
      console.log('   • Agendamiento: NO se intenta');
    }
    else if (mode === 'booking-success') {
      console.log('   • Disponibilidad general: SI (200)');
      console.log('   • Disponibilidad por hora: SI (200)');
      console.log('   • Monto: $100 (200)');
      console.log('   • Agendamiento: 200 con éxito');
    }
    else if (mode === 'booking-failed') {
      console.log('   • Disponibilidad general: SI (200)');
      console.log('   • Disponibilidad por hora: SI (200)');
      console.log('   • Monto: $50 (200) - INVÁLIDO');
      console.log('   • Agendamiento: 400 con error');
    }
    else if (mode === 'invalid-amount') {
      console.log('   • Disponibilidad general: SI (200)');
      console.log('   • Disponibilidad por hora: SI (200)');
      console.log('   • Monto: $50 (200) - INVÁLIDO');
      console.log('   • Agendamiento: 400 por monto insuficiente');
    }
    else if (mode === 'random') {
      console.log('   • Disponibilidad: Variable (200/404)');
      console.log('   • Monto: $100 (200)');
      console.log('   • Agendamiento: 49% 200, 21% 400 éxito, 30% 400 error');
    }
    
    res.status(200).json({ success: true, mode: testMode });
  } else {
    res.status(400).json({ error: 'Modo inválido', validModes });
  }
});

// Endpoints de control
app.get('/enable-timeout', (req, res) => {
  timeoutEnabled = true;
  console.log('\n⏰ TIMEOUT HABILITADO - 20% de requests tendrán timeout');
  res.status(200).json({ success: true, timeoutEnabled: true });
});

app.get('/disable-timeout', (req, res) => {
  timeoutEnabled = false;
  console.log('\n✅ TIMEOUT DESHABILITADO');
  res.status(200).json({ success: true, timeoutEnabled: false });
});

app.get('/enable-network-errors', (req, res) => {
  networkErrorEnabled = true;
  console.log('\n🌐 ERRORES DE RED HABILITADOS - 10% de requests fallarán');
  res.status(200).json({ success: true, networkErrorEnabled: true });
});

app.get('/disable-network-errors', (req, res) => {
  networkErrorEnabled = false;
  console.log('\n✅ ERRORES DE RED DESHABILITADOS');
  res.status(200).json({ success: true, networkErrorEnabled: false });
});

app.get('/force-availability', (req, res) => {
  testMode = 'availability';
  responseCount = 0;
  console.log('\n🎯 FORZANDO DISPONIBILIDAD INMEDIATA');
  console.log('   • Disponibilidad general: 200');
  console.log('   • Disponibilidad por hora: 200');
  console.log('   • Monto: $100 (200)');
  res.status(200).json({ success: true, message: 'Modo cambiado a disponibilidad forzada' });
});

app.get('/force-booking-success', (req, res) => {
  testMode = 'booking-success';
  responseCount = 0;
  console.log('\n✅ FORZANDO AGENDAMIENTO EXITOSO');
  console.log('   • Disponibilidad general: 200');
  console.log('   • Disponibilidad por hora: 200');
  console.log('   • Monto: $100 (200)');
  console.log('   • Agendamiento: 200 con éxito');
  res.status(200).json({ success: true, message: 'Modo cambiado a agendamiento exitoso forzado' });
});

app.get('/force-booking-failed', (req, res) => {
  testMode = 'booking-failed';
  responseCount = 0;
  console.log('\n❌ FORZANDO AGENDAMIENTO FALLIDO');
  console.log('   • Disponibilidad general: 200');
  console.log('   • Disponibilidad por hora: 200');
  console.log('   • Monto: $50 (200) - INVÁLIDO');
  console.log('   • Agendamiento: 400 con error');
  res.status(200).json({ success: true, message: 'Modo cambiado a agendamiento fallido forzado' });
});

app.get('/test-status', (req, res) => {
  res.status(200).json({
    testMode: testMode,
    responseCount: responseCount,
    timeoutEnabled: timeoutEnabled,
    networkErrorEnabled: networkErrorEnabled,
    lastAppointmentAttempt: lastAppointmentAttempt,
    endpoints: {
      general_availability: 'POST /appointmentAPI/public/exchange/availaptment.php',
      hourly_availability: 'POST /appointmentAPI/public/exchange/availaptmentbyhour.php',
      amount_check: 'POST /appointmentAPI/public/exchange/amountclientbyinterval.php',
      appointment: 'POST /appointmentAPI/public/exchange/appointment.php'
    }
  });
});

app.listen(PORT, () => {
  console.log(`🧪 SERVIDOR DE TESTING en http://localhost:${PORT}`);
  console.log('\n📋 MODOS DE PRUEBA:');
  console.log('   http://localhost:3001/test-mode/no-availability          - Sin disponibilidad');
  console.log('   http://localhost:3001/test-mode/availability-general-only - Gap disponibilidad');
  console.log('   http://localhost:3001/test-mode/availability             - Solo disponibilidad');
  console.log('   http://localhost:3001/test-mode/booking-success          - Éxito (200)');
  console.log('   http://localhost:3001/test-mode/booking-failed           - Fallo (400)');
  console.log('   http://localhost:3001/test-mode/invalid-amount           - Monto insuficiente');
  console.log('   http://localhost:3001/test-mode/random                   - Comportamiento real');
  console.log('');
  console.log('🚀 COMANDOS DIRECTOS:');
  console.log('   http://localhost:3001/force-availability                - Forzar disponibilidad');
  console.log('   http://localhost:3001/force-booking-success             - Forzar éxito (200)');
  console.log('   http://localhost:3001/force-booking-failed              - Forzar fallo (400)');
  console.log('   http://localhost:3001/enable-timeout                    - Habilitar timeouts');
  console.log('   http://localhost:3001/disable-timeout                   - Deshabilitar timeouts');
  console.log('   http://localhost:3001/enable-network-errors             - Habilitar errores red');
  console.log('   http://localhost:3001/disable-network-errors            - Deshabilitar errores red');
  console.log('   http://localhost:3001/test-status                       - Ver estado actual');
  console.log('\n⚡ Modo actual: ' + testMode);
  console.log('📍 El monitor debe apuntar a: http://localhost:3001');
});