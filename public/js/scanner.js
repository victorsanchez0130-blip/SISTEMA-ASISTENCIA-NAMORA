// Variable global para la instancia del escáner HTML5
let html5QrCode = null;
let camaraEncendida = false;
let procesandoEscaneo = false;

// Inicialización cuando carga el documento
document.addEventListener('DOMContentLoaded', () => {
  verificarSesion();
  cargarAsistenciasHoy();
});

// ----------------------------------------------------
// VERIFICACIÓN DE SESIÓN
// ----------------------------------------------------
function verificarSesion() {
  const usuarioGuardado = localStorage.getItem('usuario');
  if (usuarioGuardado) {
    try {
      const user = JSON.parse(usuarioGuardado);
      const elUsuario = document.getElementById('usuario-login');
      if (elUsuario) {
        elUsuario.innerHTML = `<i class="fa-solid fa-user-gear mr-1"></i> ${user.nombre || 'Operador'}`;
      }
    } catch (e) {
      console.error('Error al leer datos de sesión');
    }
  }
}

function cerrarSesion() {
  localStorage.removeItem('usuario');
  window.location.href = 'index.html';
}

// ----------------------------------------------------
// CONTROL DEL PROCESO DE ASISTENCIA (INICIAR / CERRAR)
// ----------------------------------------------------
async function iniciarRegistro() {
  try {
    const res = await fetch('/api/asistencia/iniciar', { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      actualizarUIEstadoRegistro(true);
      mostrarNotificacion('Registro de asistencia iniciado con éxito.', 'exito');
    } else {
      mostrarNotificacion(data.mensaje || 'No se pudo iniciar el registro.', 'error');
    }
  } catch (err) {
    console.error(err);
    mostrarNotificacion('Error de conexión con el servidor.', 'error');
  }
}

async function cerrarRegistro() {
  const confirmar = confirm('¿Desea cerrar la toma de asistencia?\n\nSe asignará automáticamente "FALTA" a todos los usuarios (alumnos y docentes) que no hayan escaneado su QR el día de hoy.');
  if (!confirmar) return;

  try {
    const res = await fetch('/api/asistencia/cerrar', { method: 'POST' });
    const data = await res.json();

    if (data.success) {
      actualizarUIEstadoRegistro(false);
      mostrarNotificacion(data.mensaje, 'alerta');
      cargarAsistenciasHoy(); // Refrescar la tabla para mostrar las faltas
    } else {
      mostrarNotificacion(data.mensaje || 'Error al cerrar el registro.', 'error');
    }
  } catch (err) {
    console.error(err);
    mostrarNotificacion('Error al procesar el cierre de asistencia.', 'error');
  }
}

function actualizarUIEstadoRegistro(activo) {
  const badge = document.getElementById('estado-registro-badge');
  const btnIniciar = document.getElementById('btn-iniciar');
  const btnCerrar = document.getElementById('btn-cerrar');

  if (activo) {
    badge.className = 'inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-700 border border-emerald-200';
    badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> EN PROCESO';

    btnIniciar.disabled = true;
    btnIniciar.classList.add('opacity-50', 'cursor-not-allowed');

    btnCerrar.disabled = false;
    btnCerrar.classList.remove('opacity-50', 'cursor-not-allowed');
  } else {
    badge.className = 'inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-md bg-red-100 text-red-700 border border-red-200';
    badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span> CERRADO';

    btnIniciar.disabled = false;
    btnIniciar.classList.remove('opacity-50', 'cursor-not-allowed');

    btnCerrar.disabled = true;
    btnCerrar.classList.add('opacity-50', 'cursor-not-allowed');
  }
}

// ----------------------------------------------------
// CONTROL DE LA CÁMARA (HTML5-QRCode)
// ----------------------------------------------------
function toggleCamara() {
  if (camaraEncendida) {
    detenerCamara();
  } else {
    encenderCamara();
  }
}

function encenderCamara() {
  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode("reader");
  }

  const config = { fps: 10, qrbox: { width: 250, height: 250 } };

  html5QrCode.start(
    { facingMode: "environment" },
    config,
    onScanSuccess,
    onScanFailure
  ).then(() => {
    camaraEncendida = true;
    document.getElementById('camara-status').innerText = 'Activa';
    document.getElementById('camara-status').className = 'text-xs font-semibold text-emerald-600';
    
    const btn = document.getElementById('btn-toggle-camara');
    btn.innerHTML = '<i class="fa-solid fa-power-off mr-1"></i> Apagar Cámara';
    btn.className = 'w-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-sm';
  }).catch(err => {
    console.error("Error al iniciar cámara:", err);
    mostrarNotificacion('No se pudo acceder a la cámara.', 'error');
  });
}

function detenerCamara() {
  if (html5QrCode && camaraEncendida) {
    html5QrCode.stop().then(() => {
      camaraEncendida = false;
      document.getElementById('camara-status').innerText = 'Inactiva';
      document.getElementById('camara-status').className = 'text-xs font-normal text-slate-400';

      const btn = document.getElementById('btn-toggle-camara');
      btn.innerHTML = '<i class="fa-solid fa-power-off mr-1"></i> Encender Cámara';
      btn.className = 'w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-sm';
    }).catch(err => console.error("Error al detener cámara:", err));
  }
}

// ----------------------------------------------------
// PROCESAMIENTO DE ESCANEO QR
// ----------------------------------------------------
function onScanSuccess(decodedText, decodedResult) {
  if (procesandoEscaneo) return; // Evitar múltiples peticiones por el mismo encuadre
  procesandoEscaneo = true;

  enviarMarcacionQR(decodedText);

  // Pausa de 2.5 segundos antes de permitir leer otro código
  setTimeout(() => {
    procesandoEscaneo = false;
  }, 2500);
}

function onScanFailure(error) {
  // Ignorar errores continuos de búsqueda de frame QR
}

async function enviarMarcacionQR(codigoQR) {
  try {
    const res = await fetch('/api/asistencia/marcar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigoQR })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      renderizarTarjetaResultado(data.usuario, data.estado, data.hora, false);
      mostrarNotificacion(data.mensaje, 'exito');
      cargarAsistenciasHoy();
    } else if (data.duplicado) {
      renderizarTarjetaResultado(data.usuario, 'DUPLICADO', data.horaAnterior, true);
      mostrarNotificacion(data.mensaje, 'alerta');
    } else {
      mostrarNotificacion(data.mensaje || 'Error al procesar el código.', 'error');
    }
  } catch (err) {
    console.error(err);
    mostrarNotificacion('Error de comunicación con el servidor.', 'error');
  }
}

// ----------------------------------------------------
// REPORTE DE ULTIMA MARCACIÓN Y TABLA
// ----------------------------------------------------
function renderizarTarjetaResultado(usuario, estado, hora, esDuplicado) {
  const card = document.getElementById('resultado-card');
  if (!card) return;

  let badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-300';
  if (estado === 'TARDANZA') badgeColor = 'bg-amber-100 text-amber-800 border-amber-300';
  if (esDuplicado) badgeColor = 'bg-blue-100 text-blue-800 border-blue-300';

  card.className = "bg-white border border-slate-200 rounded-xl p-5 shadow-sm text-center flex flex-col items-center justify-center w-full";
  card.innerHTML = `
    <div class="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center text-2xl font-bold mb-3 border border-indigo-100">
      ${usuario.nombre ? usuario.nombre.charAt(0) : 'U'}
    </div>
    <h3 class="text-base font-bold text-slate-800">${usuario.nombre}</h3>
    <p class="text-xs text-slate-500 font-medium mb-3">${usuario.rol} — ${usuario.materia_aula || 'Sin asignación'}</p>
    
    <div class="flex items-center gap-2">
      <span class="text-xs font-bold px-3 py-1 rounded-full border ${badgeColor}">
        ${estado}
      </span>
      <span class="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
        <i class="fa-regular fa-clock mr-1"></i>${hora}
      </span>
    </div>
  `;
}

async function cargarAsistenciasHoy() {
  const tbody = document.getElementById('tabla-asistencias-hoy');
  if (!tbody) return;

  try {
    const res = await fetch('/api/asistencia/hoy');
    const marcaciones = await res.json();

    if (!Array.isArray(marcaciones) || marcaciones.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center py-6 text-slate-400 font-medium">No hay marcaciones registradas el día de hoy.</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = marcaciones.map(m => {
      let badgeClase = 'bg-emerald-100 text-emerald-700';
      if (m.estado === 'TARDANZA' || m.estado === 'TARDE') badgeClase = 'bg-amber-100 text-amber-700';
      if (m.estado === 'FALTA' || m.estado === 'INJUSTIFICADA') badgeClase = 'bg-red-100 text-red-700';
      if (m.estado === 'JUSTIFICADA') badgeClase = 'bg-blue-100 text-blue-700';

      return `
        <tr class="hover:bg-slate-50 transition-colors">
          <td class="py-3 px-3 font-mono text-slate-600 font-bold">${m.codigo}</td>
          <td class="py-3 px-3 font-semibold text-slate-800">${m.nombre}</td>
          <td class="py-3 px-3 text-slate-500">${m.rol}</td>
          <td class="py-3 px-3 font-medium text-slate-600">${m.hora}</td>
          <td class="py-3 px-3">
            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${badgeClase}">
              ${m.estado}
            </span>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error("Error al cargar asistencias:", err);
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-6 text-red-500 font-medium">Error al actualizar la lista de asistencia.</td>
      </tr>
    `;
  }
}

// ----------------------------------------------------
// SISTEMA DE NOTIFICACIONES
// ----------------------------------------------------
function mostrarNotificacion(mensaje, tipo) {
  const notif = document.getElementById('notificacion-alerta');
  if (!notif) return;

  notif.classList.remove('hidden', 'bg-emerald-100', 'text-emerald-800', 'bg-amber-100', 'text-amber-800', 'bg-red-100', 'text-red-800');

  if (tipo === 'exito') {
    notif.classList.add('bg-emerald-100', 'text-emerald-800');
  } else if (tipo === 'alerta') {
    notif.classList.add('bg-amber-100', 'text-amber-800');
  } else {
    notif.classList.add('bg-red-100', 'text-red-800');
  }

  notif.innerText = mensaje;

  setTimeout(() => {
    notif.classList.add('hidden');
  }, 4000);
}