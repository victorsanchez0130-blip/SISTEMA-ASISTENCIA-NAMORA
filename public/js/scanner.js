let html5QrCode;
let escaneoBloqueado = false;

document.addEventListener("DOMContentLoaded", () => {
  if (typeof checkAuth === 'function') checkAuth();
  initScanner();
  loadMarcaciones();
});

function initScanner() {
  html5QrCode = new Html5Qrcode("reader");

  // Configuración para el área de escaneo
  const config = { 
    fps: 10, 
    qrbox: { width: 220, height: 220 } 
  };

  // Intentar abrir la cámara trasera (environment) para smartphones
  html5QrCode.start(
    { facingMode: "environment" }, 
    config, 
    onScanSuccess, 
    () => {
      // Búsqueda continua de QR (errores silenciosos)
    }
  ).catch(err => {
    console.warn("No se pudo iniciar cámara trasera, probando cámara genérica/frontal:", err);
    
    // Intento secundario si no detecta la trasera o es laptop con webcam
    html5QrCode.start(
      { facingMode: "user" }, 
      config, 
      onScanSuccess, 
      null
    ).catch(err2 => {
      console.error("Error definitivo al iniciar la cámara:", err2);
      const feedback = document.getElementById('scan-feedback');
      if (feedback) {
        feedback.innerText = "No se pudo acceder a la cámara. Asegúrate de otorgar permisos en tu navegador.";
        feedback.className = "mt-4 block p-3 rounded-lg text-center font-bold text-xs bg-red-100 text-red-700";
      }
    });
  });
}

async function onScanSuccess(decodedText) {
  if (escaneoBloqueado) return;

  // Extraer el código exacto (ALU-SRN-XXXX, DOC-SRN-XXXX, etc.)
  const match = decodedText.match(/(ALU|DOC|DIR|AUX)-SRN-\d+/i);
  const codigoLimpio = match ? match[0].toUpperCase() : decodedText.trim();

  // Bloquear escaneos y pausar la cámara mientras se muestra la ventana emergente
  escaneoBloqueado = true;
  if (html5QrCode) {
    try {
      html5QrCode.pause(true);
    } catch (e) {
      console.warn("No se pudo pausar el escáner:", e);
    }
  }

  const horaActual = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  try {
    const res = await fetch('/api/asistencia/marcar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigoQR: codigoLimpio, codigo: codigoLimpio })
    });

    const data = await res.json();

    if (data.success) {
      const usuario = data.usuario || data.alumno || {};
      const nombreRegistrado = usuario.nombre || data.nombre || 'Usuario Registrado';
      const estadoTexto = data.estado || (data.tardanza ? 'TARDE' : 'PUNTUAL');

      // 1. Mostrar Pop-Up con la información
      mostrarPopUp({
        exito: true,
        nombre: nombreRegistrado,
        codigo: codigoLimpio,
        aula: usuario.materia_aula || usuario.aula || 'Sin Asignación',
        hora: horaActual,
        estado: estadoTexto
      });

      // 2. Insertar instantáneamente en la tabla lateral
      agregarFilaEnTabla({
        codigo: codigoLimpio,
        nombre: nombreRegistrado,
        hora: horaActual,
        estado: estadoTexto
      });

    } else {
      mostrarPopUp({
        exito: false,
        nombre: 'No Registrado',
        codigo: codigoLimpio,
        aula: '-',
        hora: horaActual,
        estado: data.message || 'Error al procesar'
      });
    }
  } catch (err) {
    console.error("Error en petición de marcación:", err);
    mostrarPopUp({
      exito: false,
      nombre: 'Error de Servidor',
      codigo: codigoLimpio,
      aula: '-',
      hora: horaActual,
      estado: 'Sin respuesta de red'
    });
  }
}

// Función para insertar la nueva marcación al inicio de la tabla en tiempo real
function agregarFilaEnTabla(registro) {
  const tbody = document.getElementById('today-records-body');
  if (!tbody) return;

  // Si estaba el mensaje de "Sin marcaciones", limpiamos la tabla
  if (tbody.innerText.includes('Sin marcaciones')) {
    tbody.innerHTML = '';
  }

  // Evitar agregar duplicados inmediatos en la vista
  const filasExistentes = tbody.querySelectorAll('tr');
  for (let fila of filasExistentes) {
    if (fila.innerText.includes(registro.codigo)) {
      return; 
    }
  }

  const esTarde = registro.estado === 'TARDE' || registro.estado === 'TARDANZA';
  const badgeClass = esTarde 
    ? 'bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded' 
    : 'bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded';

  const nuevaFila = document.createElement('tr');
  nuevaFila.className = 'border-b border-slate-100 text-xs bg-blue-50/50 hover:bg-slate-50 transition-colors';
  nuevaFila.innerHTML = `
    <td class="p-2 font-mono font-bold text-slate-700">${registro.codigo}</td>
    <td class="p-2 font-medium text-slate-800">${registro.nombre}</td>
    <td class="p-2 text-center text-slate-500 font-mono">${registro.hora}</td>
    <td class="p-2 text-center"><span class="${badgeClass}">${registro.estado}</span></td>
  `;

  // Insertar al principio de la lista
  tbody.insertBefore(nuevaFila, tbody.firstChild);
}

function mostrarPopUp(info) {
  const iconEl = document.getElementById('modal-icon');
  const titleEl = document.getElementById('modal-title');
  const nombreEl = document.getElementById('modal-nombre');
  const codigoEl = document.getElementById('modal-codigo');
  const aulaEl = document.getElementById('modal-aula');
  const horaEl = document.getElementById('modal-hora');
  const estadoEl = document.getElementById('modal-estado');

  if (iconEl) iconEl.innerText = info.exito ? '✅' : '❌';
  if (titleEl) titleEl.innerText = info.exito ? 'Marcación Registrada' : 'Error en Marcación';
  if (nombreEl) nombreEl.innerText = info.nombre;
  if (codigoEl) codigoEl.innerText = info.codigo;
  if (aulaEl) aulaEl.innerText = info.aula;
  if (horaEl) horaEl.innerText = info.hora;

  if (estadoEl) {
    estadoEl.innerText = info.estado;
    if (info.exito) {
      estadoEl.className = (info.estado === 'TARDE' || info.estado === 'TARDANZA') 
        ? 'font-bold text-amber-600' 
        : 'font-bold text-green-600';
    } else {
      estadoEl.className = 'font-bold text-red-600';
    }
  }

  const modal = document.getElementById('modal-asistencia');
  if (modal) modal.classList.remove('hidden');
}

function cerrarModalYContinuar() {
  const modal = document.getElementById('modal-asistencia');
  if (modal) modal.classList.add('hidden');
  
  setTimeout(() => {
    escaneoBloqueado = false;
    if (html5QrCode) {
      try {
        html5QrCode.resume();
      } catch (e) {
        console.warn("No se pudo reanudar el escáner:", e);
      }
    }
  }, 300);
}

app.get('/api/asistencia/hoy', async (req, res) => {
  try {
    // 1. Obtener la fecha actual formateada en la zona horaria de Perú (YYYY-MM-DD)
    const fechaHoyPeru = new Date().toLocaleDateString('es-PE', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).split('/').reverse().join('-'); // Convierte DD/MM/YYYY a YYYY-MM-DD

    // 2. Consulta SQL flexible:
    // Unimos con 'usuarios' para obtener el nombre actualizado y filtramos por la fecha de hoy
    const query = `
      SELECT 
        a.codigo,
        COALESCE(u.nombre, a.nombre, 'Usuario Registrado') AS nombre,
        COALESCE(u.materia_aula, u.aula, 'Sin asignación') AS rol_asignacion,
        a.hora,
        a.estado,
        a.fecha
      FROM asistencia a
      LEFT JOIN usuarios u ON UPPER(a.codigo) = UPPER(u.codigo)
      WHERE DATE(a.fecha) = $1 
         OR a.fecha LIKE $2
         OR a.fecha = $1
      ORDER BY a.id DESC;
    `;

    // Ejecutar consulta (adaptar según tu cliente SQL: db.query, pool.query, sqlite, etc.)
    const { rows } = await db.query(query, [fechaHoyPeru, `${fechaHoyPeru}%`]);

    // 3. Normalizar la respuesta para asegurar que el frontend siempre reciba campos válidos
    const marcacionesNormalizadas = (rows || []).map(item => {
      const esTarde = item.estado && (item.estado.toUpperCase() === 'TARDE' || item.estado.toUpperCase() === 'TARDANZA');
      return {
        codigo: item.codigo || '-',
        nombre: item.nombre || 'Usuario Registrado',
        rol: item.rol_asignacion || '-',
        hora: item.hora || (item.fecha ? new Date(item.fecha).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '-'),
        estado: item.estado ? item.estado.toUpperCase() : (esTarde ? 'TARDE' : 'PUNTUAL')
      };
    });

    return res.status(200).json(marcacionesNormalizadas);

  } catch (error) {
    console.error("Error al obtener marcaciones de hoy:", error);
    // Devolver un array vacío con 200 o status 500 para evitar que el frontend colapse
    return res.status(500).json({ error: true, message: "Error al consultar las marcaciones de hoy" });
  }
});