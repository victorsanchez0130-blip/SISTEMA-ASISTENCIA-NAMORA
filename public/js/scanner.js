let html5QrcodeScanner;
let escaneoBloqueado = false;

document.addEventListener("DOMContentLoaded", () => {
  checkAuth();
  initScanner();
  loadMarcaciones();
});

function initScanner() {
  html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
  html5QrcodeScanner.render(onScanSuccess);
}

async function onScanSuccess(decodedText) {
  if (escaneoBloqueado) return;

  // Extraer el código exacto (ALU-SRN-XXXX, DOC-SRN-XXXX, etc.)
  const match = decodedText.match(/(ALU|DOC|DIR|AUX)-SRN-\d+/i);
  const codigoLimpio = match ? match[0].toUpperCase() : decodedText.trim();

  // Bloquear escaneos y pausar la cámara
  escaneoBloqueado = true;
  if (html5QrcodeScanner) {
    try {
      html5QrcodeScanner.pause(true);
    } catch (e) {
      console.warn("No se pudo pausar el escáner:", e);
    }
  }

  const res = await fetch('/api/asistencia/marcar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigoQR: codigoLimpio, codigo: codigoLimpio })
  });

  const data = await res.json();
  const horaActual = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

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

    // 2. INSERTAR INSTANTÁNEAMENTE EN LA TABLA DE LA DERECHA
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
}

// Función para insertar la nueva marcación al inicio de la tabla en tiempo real
function agregarFilaEnTabla(registro) {
  const tbody = document.getElementById('today-records-body');
  if (!tbody) return;

  // Si estaba el mensaje de "Sin marcaciones", limpiamos la tabla
  if (tbody.innerText.includes('Sin marcaciones')) {
    tbody.innerHTML = '';
  }

  // Verificar si la marcación de este código ya está mostrada en pantalla para no duplicar la fila
  const filasExistentes = tbody.querySelectorAll('tr');
  for (let fila of filasExistentes) {
    if (fila.innerText.includes(registro.codigo)) {
      return; // Ya fue agregado visualmente
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
  document.getElementById('modal-icon').innerText = info.exito ? '✅' : '❌';
  document.getElementById('modal-title').innerText = info.exito ? 'Marcación Registrada' : 'Error en Marcación';
  document.getElementById('modal-nombre').innerText = info.nombre;
  document.getElementById('modal-codigo').innerText = info.codigo;
  document.getElementById('modal-aula').innerText = info.aula;
  document.getElementById('modal-hora').innerText = info.hora;

  const elEstado = document.getElementById('modal-estado');
  elEstado.innerText = info.estado;
  
  if (info.exito) {
    elEstado.className = (info.estado === 'TARDE' || info.estado === 'TARDANZA') 
      ? 'font-bold text-amber-600' 
      : 'font-bold text-green-600';
  } else {
    elEstado.className = 'font-bold text-red-600';
  }

  document.getElementById('modal-asistencia').classList.remove('hidden');
}

function cerrarModalYContinuar() {
  document.getElementById('modal-asistencia').classList.add('hidden');
  
  setTimeout(() => {
    escaneoBloqueado = false;
    if (html5QrcodeScanner) {
      try {
        html5QrcodeScanner.resume();
      } catch (e) {
        console.warn("No se pudo reanudar el escáner:", e);
      }
    }
  }, 300);
}

async function loadMarcaciones() {
  try {
    const res = await fetch('/api/asistencia/hoy');
    const tbody = document.getElementById('today-records-body');
    if (!tbody) return;

    if (!res.ok) {
      tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400 font-medium">Sin marcaciones registradas hoy</td></tr>';
      return;
    }

    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400 font-medium">Sin marcaciones registradas hoy</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    data.forEach(item => {
      const esTarde = item.estado === 'TARDE' || item.estado === 'TARDANZA';
      const badgeClass = esTarde 
        ? 'bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded' 
        : 'bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded';
      
      const estadoTexto = item.estado || (esTarde ? 'TARDE' : 'PUNTUAL');
      const horaTexto = item.hora || item.fecha || '-';

      tbody.innerHTML += `
        <tr class="border-b border-slate-100 text-xs hover:bg-slate-50">
          <td class="p-2 font-mono font-bold text-slate-700">${item.codigo}</td>
          <td class="p-2 font-medium text-slate-800">${item.nombre}</td>
          <td class="p-2 text-center text-slate-500 font-mono">${horaTexto}</td>
          <td class="p-2 text-center"><span class="${badgeClass}">${estadoTexto}</span></td>
        </tr>
      `;
    });
  } catch (e) {
    console.error("Error al cargar marcaciones de hoy:", e);
  }
}