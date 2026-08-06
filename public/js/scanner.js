// Variable global para la instancia del escáner HTML5
let html5QrCode = null;
let camaraEncendida = false;
let procesandoEscaneo = false;

// Inicialización cuando carga el DOM
document.addEventListener('DOMContentLoaded', () => {
  verificarSesion();
  cargarAsistenciasHoy();
  enfocarInputManual();
});

// ----------------------------------------------------
// VERIFICACIÓN DE SESIÓN Y ROL DE AUXILIAR
// ----------------------------------------------------
function verificarSesion() {
  const sessionData = localStorage.getItem('user_session') || localStorage.getItem('usuario');
  
  if (!sessionData) {
    window.location.href = 'index.html';
    return;
  }

  try {
    const user = JSON.parse(sessionData);
    const userRol = (user.rol || '').trim().toLowerCase();

    // Permitir acceso solo a Auxiliar, Director y Directivo
    const rolesPermitidos = ['auxiliar', 'director', 'directivo', 'admin'];
    if (!rolesPermitidos.includes(userRol)) {
      alert('Acceso restringido: No cuenta con permisos de Auxiliar.');
      window.location.href = 'index.html';
      return;
    }

    const elNombreAuxiliar = document.getElementById('nombre-auxiliar');
    if (elNombreAuxiliar) {
      elNombreAuxiliar.innerText = user.nombre || user.usuario || 'Auxiliar General';
    }
  } catch (e) {
    console.error('Error al leer datos de sesión:', e);
    localStorage.removeItem('usuario');
    localStorage.removeItem('user_session');
    window.location.href = 'index.html';
  }
}

function cerrarSesion() {
  localStorage.removeItem('usuario');
  localStorage.removeItem('user_session');
  window.location.href = 'index.html';
}

// ----------------------------------------------------
// CONTROL DEL PROCESO DE ASISTENCIA (INICIAR / CERRAR)
// ----------------------------------------------------
async function iniciarRegistro() {
  try {
    const res = await fetch('api/asistencia/iniciar', { method: 'POST' });
    const data = await res.json();

    if (res.ok && data.success) {
      actualizarUIEstadoRegistro(true);
      mostrarNotificacion('Registro de asistencia iniciado con éxito.', 'exito');
      reproducirSonido('exito');
    } else {
      mostrarNotificacion(data.mensaje || 'No se pudo iniciar el registro.', 'error');
      reproducirSonido('error');
    }
  } catch (err) {
    console.error('Error al iniciar registro:', err);
    mostrarNotificacion('Error de conexión con el servidor.', 'error');
  }
}

async function cerrarRegistro() {
  const confirmar = confirm('¿Desea cerrar la toma de asistencia?\n\nSe asignará automáticamente "FALTA" a todos los usuarios (alumnos y docentes) que no hayan escaneado su QR el día de hoy.');
  if (!confirmar) return;

  try {
    const res = await fetch('api/asistencia/cerrar', { method: 'POST' });
    const data = await res.json();

    if (res.ok && data.success) {
      actualizarUIEstadoRegistro(false);
      mostrarNotificacion(data.mensaje || 'Asistencia cerrada correctamente.', 'alerta');
      cargarAsistenciasHoy(); // Refrescar la tabla para mostrar las faltas
    } else {
      mostrarNotificacion(data.mensaje || 'Error al cerrar el registro.', 'error');
    }
  } catch (err) {
    console.error('Error al cerrar registro:', err);
    mostrarNotificacion('Error al procesar el cierre de asistencia.', 'error');
  }
}

function actualizarUIEstadoRegistro(activo) {
  const badge = document.getElementById('estado-registro-badge');
  const btnIniciar = document.getElementById('btn-iniciar');
  const btnCerrar = document.getElementById('btn-cerrar');

  if (!badge || !btnIniciar || !btnCerrar) return;

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

  const config = { fps: 10, qrbox: { width: 220, height: 220 } };

  html5QrCode.start(
    { facingMode: "environment" },
    config,
    onScanSuccess,
    onScanFailure
  ).then(() => {
    camaraEncendida = true;
    const statusEl = document.getElementById('camara-status');
    if (statusEl) {
      statusEl.innerText = 'Activa';
      statusEl.className = 'text-xs font-semibold text-emerald-600';
    }
    
    const btn = document.getElementById('btn-toggle-camara');
    if (btn) {
      btn.innerHTML = '<i class="fa-solid fa-power-off mr-1"></i> Apagar Cámara';
      btn.className = 'w-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-sm';
    }
  }).catch(err => {
    console.error("Error al iniciar cámara:", err);
    mostrarNotificacion('No se pudo acceder a la cámara. Verifique los permisos.', 'error');
  });
}

function detenerCamara() {
  if (html5QrCode && camaraEncendida) {
    html5QrCode.stop().then(() => {
      camaraEncendida = false;
      const statusEl = document.getElementById('camara-status');
      if (statusEl) {
        statusEl.innerText = 'Inactiva';
        statusEl.className = 'text-xs font-normal text-slate-400';
      }

      const btn = document.getElementById('btn-toggle-camara');
      if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-power-off mr-1"></i> Encender Cámara';
        btn.className = 'w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-sm';
      }
    }).catch(err => console.error("Error al detener cámara:", err));
  }
}

// ----------------------------------------------------
// PROCESAMIENTO DE ESCANEO QR Y BARRAS
// ----------------------------------------------------
function onScanSuccess(decodedText) {
  if (procesandoEscaneo) return;
  procesandoEscaneo = true;

  enviarMarcacionQR(decodedText.trim());

  // Pausa de 2.5 segundos para evitar lecturas continuas
  setTimeout(() => {
    procesandoEscaneo = false;
  }, 2500);
}

function onScanFailure(error) {
  // Búsqueda continua silenciosa
}

function procesarEscaneoManual(e) {
  e.preventDefault();
  const input = document.getElementById('input-codigo-manual');
  if (!input) return;

  const codigo = input.value.trim();
  if (codigo) {
    enviarMarcacionQR(codigo);
    input.value = '';
  }
}

function enfocarInputManual() {
  const input = document.getElementById('input-codigo-manual');
  if (input) input.focus();
}

async function enviarMarcacionQR(codigoQR) {
  try {
    const res = await fetch('api/asistencia/marcar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigoQR })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      renderizarTarjetaResultado(data.usuario || { nombre: data.nombre || 'Usuario' }, data.estado || 'REGISTRADO', data.hora || '--:--', false);
      mostrarNotificacion(data.mensaje || 'Asistencia registrada correctamente.', 'exito');
      reproducirSonido('exito');
      cargarAsistenciasHoy();
    } else if (data.duplicado) {
      renderizarTarjetaResultado(data.usuario || { nombre: data.nombre || 'Usuario' }, 'DUPLICADO', data.horaAnterior || '--:--', true);
      mostrarNotificacion(data.mensaje || 'El usuario ya registró su asistencia.', 'alerta');
      reproducirSonido('alerta');
    } else {
      mostrarNotificacion(data.mensaje || 'Código QR no registrado o inválido.', 'error');
      reproducirSonido('error');
    }
  } catch (err) {
    console.error('Error de red:', err);
    mostrarNotificacion('Error de comunicación con el servidor.', 'error');
  } finally {
    enfocarInputManual();
  }
}

// ----------------------------------------------------
// RENDERIZADO Y TABLA DE ASISTENCIAS
// ----------------------------------------------------
function renderizarTarjetaResultado(usuario, estado, hora, esDuplicado) {
  const card = document.getElementById('resultado-card');
  if (!card) return;

  let badgeColor = 'bg-emerald-100 text-emerald-800 border-emerald-300';
  if (estado === 'TARDANZA' || estado === 'TARDE') badgeColor = 'bg-amber-100 text-amber-800 border-amber-300';
  if (esDuplicado) badgeColor = 'bg-blue-100 text-blue-800 border-blue-300';
  if (estado === 'FALTA') badgeColor = 'bg-red-100 text-red-800 border-red-300';

  const inicial = usuario && usuario.nombre ? usuario.nombre.charAt(0).toUpperCase() : 'U';
  const nombre = usuario && usuario.nombre ? usuario.nombre : 'Usuario General';
  const rolMateria = usuario ? `${usuario.rol || 'Estudiante'} — ${usuario.materia_aula || 'Sin asignación'}` : 'Sin datos';

  card.className = "bg-white border border-slate-200 rounded-xl p-5 shadow-sm text-center flex flex-col items-center justify-center w-full min-h-[220px]";
  card.innerHTML = `
    <div class="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center text-2xl font-bold mb-3 border border-indigo-100 shadow-inner">
      ${inicial}
    </div>
    <h3 class="text-base font-bold text-slate-800">${nombre}</h3>
    <p class="text-xs text-slate-500 font-medium mb-3">${rolMateria}</p>
    
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
    const res = await fetch('api/asistencia/hoy');
    
    if (!res.ok) throw new Error('Error en HTTP ' + res.status);
    
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
        <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100">
          <td class="py-3 px-3 font-mono text-slate-600 font-bold">${m.codigo || m.codigoQR || '-'}</td>
          <td class="py-3 px-3 font-semibold text-slate-800">${m.nombre || 'Desconocido'}</td>
          <td class="py-3 px-3 text-slate-500">${m.rol || 'Estudiante'}</td>
          <td class="py-3 px-3 font-medium text-slate-600">${m.hora || '--:--'}</td>
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
// NOTIFICACIONES Y FEEDBACK SONORO
// ----------------------------------------------------
function mostrarNotificacion(mensaje, tipo) {
  const notif = document.getElementById('notificacion-alerta');
  if (!notif) return;

  notif.className = 'mt-3 p-3 rounded-xl text-xs font-semibold text-center transition-all block';

  if (tipo === 'exito') {
    notif.classList.add('bg-emerald-100', 'text-emerald-800', 'border', 'border-emerald-200');
  } else if (tipo === 'alerta') {
    notif.classList.add('bg-amber-100', 'text-amber-800', 'border', 'border-amber-200');
  } else {
    notif.classList.add('bg-red-100', 'text-red-800', 'border', 'border-red-200');
  }

  notif.innerText = mensaje;

  setTimeout(() => {
    notif.className = 'hidden';
  }, 4000);
}

function reproducirSonido(tipo) {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;

    const audioCtx = new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (tipo === 'exito') {
      osc.frequency.setValueAtTime(800, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } else if (tipo === 'alerta') {
      osc.frequency.setValueAtTime(500, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.2);
    } else {
      osc.frequency.setValueAtTime(250, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    }
  } catch (e) {
    // Silenciar fallos de reproducción por falta de interacción inicial del usuario
  }
}