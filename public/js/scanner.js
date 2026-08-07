/**
 * Control de Asistencia QR - I.E. SANTA ROSA
 * Lógica modular para scanner.js - Versión Corregida con Bloqueo de Duplicados Extremos
 */

let datosReporteGlobal = [];
let modoActual = 'ENTRADA'; 
let jornadaActiva = false;
let html5QrcodeScanner = null;
let camaraEncendida = false;
let procesandoEscaneoQR = false; 
let registroLocalMarcaciones = []; // Almacena las marcaciones del día en memoria para bloqueo rápido

const FERIADOS_PERU_MMDD = [
  '01-01', '05-01', '06-07', '06-29', '07-23', '07-28', '07-29', '08-06', '08-30', '10-08', '11-01', '12-08', '12-09', '12-25'
];

document.addEventListener('DOMContentLoaded', () => {
  cargarDatosAuxiliar();
  configurarEventosTeclado();
  cargarAsistenciasHoy();
  
  // Inicializar modo UI
  cambiarModoRegistro('ENTRADA');
});

function cargarDatosAuxiliar() {
  const sessionRaw = localStorage.getItem('user_session') || localStorage.getItem('usuario') || localStorage.getItem('user');
  let nombreAuxiliar = 'Auxiliar';
  let rolAuxiliar = 'AUXILIAR';

  if (sessionRaw) {
    try {
      const session = JSON.parse(sessionRaw);
      nombreAuxiliar = session.nombre || session.nombre_completo || session.nombres || session.usuario || 'Auxiliar';
      rolAuxiliar = (session.rol || session.tipo || 'AUXILIAR').toUpperCase();
    } catch (e) {}
  }

  const elNombre = document.getElementById('nombre-auxiliar');
  const elRol = document.getElementById('auxiliar-rol');
  if (elNombre) elNombre.innerText = nombreAuxiliar;
  if (elRol) elRol.innerText = rolAuxiliar;
}

function cambiarModoRegistro(nuevoModo) {
  modoActual = nuevoModo;
  const lblEntrada = document.getElementById('lbl-modo-entrada');
  const lblSalida = document.getElementById('lbl-modo-salida');

  if (nuevoModo === 'SALIDA') {
    if (lblSalida) lblSalida.className = "cursor-pointer flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-indigo-600 text-white shadow-sm scale-105";
    if (lblEntrada) lblEntrada.className = "cursor-pointer flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-600 hover:bg-slate-200 opacity-70";
  } else {
    if (lblEntrada) lblEntrada.className = "cursor-pointer flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-emerald-600 text-white shadow-sm scale-105";
    if (lblSalida) lblSalida.className = "cursor-pointer flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-600 hover:bg-slate-200 opacity-70";
  }
}

function iniciarRegistro() {
  jornadaActiva = true;
  const badge = document.getElementById('estado-registro-badge');
  if (badge) {
    badge.className = "inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-700 border border-emerald-200";
    badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> ABIERTO`;
  }
  const btnIniciar = document.getElementById('btn-iniciar');
  const btnCerrar = document.getElementById('btn-cerrar');
  if (btnIniciar) { btnIniciar.disabled = true; btnIniciar.classList.add('opacity-50', 'cursor-not-allowed'); }
  if (btnCerrar) { btnCerrar.disabled = false; btnCerrar.classList.remove('opacity-50', 'cursor-not-allowed'); }

  mostrarNotificacion("🟢 Jornada iniciada. Sistema listo.", "bg-emerald-100 text-emerald-800 border-emerald-300");
}

function cerrarRegistro() {
  jornadaActiva = false;
  const badge = document.getElementById('estado-registro-badge');
  if (badge) {
    badge.className = "inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-md bg-red-100 text-red-700 border border-red-200";
    badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-red-500"></span> CERRADO`;
  }
  const btnIniciar = document.getElementById('btn-iniciar');
  const btnCerrar = document.getElementById('btn-cerrar');
  if (btnIniciar) { btnIniciar.disabled = false; btnIniciar.classList.remove('opacity-50', 'cursor-not-allowed'); }
  if (btnCerrar) { btnCerrar.disabled = true; btnCerrar.classList.add('opacity-50', 'cursor-not-allowed'); }

  if (camaraEncendida) detenerCamara();
  mostrarNotificacion("🔴 Jornada cerrada.", "bg-rose-100 text-rose-800 border-rose-300");
}

function toggleCamara() {
  if (camaraEncendida) detenerCamara(); else iniciarCamara();
}

function iniciarCamara() {
  const readerContainer = document.getElementById('reader');
  if (!readerContainer) return;

  readerContainer.innerHTML = "";
  if (typeof Html5Qrcode === 'undefined') {
    alert("La librería HTML5 QR Code no está cargada.");
    return;
  }

  try {
    html5QrcodeScanner = new Html5Qrcode("reader");
    const config = { fps: 15, qrbox: { width: 250, height: 250 } };

    html5QrcodeScanner.start(
      { facingMode: "environment" },
      config,
      (decodedText) => manejarEscaneoControlado(decodedText),
      () => {}
    ).then(() => {
      camaraEncendida = true;
      actualizarEstadoCamaraUI(true);
    }).catch(() => {
      // Fallback a cámara frontal
      html5QrcodeScanner.start(
        { facingMode: "user" },
        config,
        (decodedText) => manejarEscaneoControlado(decodedText),
        () => {}
      ).then(() => {
        camaraEncendida = true;
        actualizarEstadoCamaraUI(true);
      }).catch(err => {
        console.error(err);
        alert("Error al acceder a la cámara.");
      });
    });
  } catch (e) { console.error(e); }
}

function detenerCamara() {
  if (html5QrcodeScanner && camaraEncendida) {
    html5QrcodeScanner.stop().then(() => {
      camaraEncendida = false;
      actualizarEstadoCamaraUI(false);
    }).catch(() => {
      camaraEncendida = false;
      actualizarEstadoCamaraUI(false);
    });
  }
}

function actualizarEstadoCamaraUI(activa) {
  const btnToggle = document.getElementById('btn-toggle-camara');
  const readerContainer = document.getElementById('reader');

  if (activa) {
    if (btnToggle) {
      btnToggle.innerHTML = `<i class="fa-solid fa-power-off"></i> Apagar Cámara`;
      btnToggle.className = "w-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2";
    }
  } else {
    if (readerContainer) {
      readerContainer.innerHTML = `
        <div class="text-center p-6 text-slate-400 flex flex-col items-center justify-center h-full">
          <i class="fa-solid fa-video-slash text-3xl mb-2 block"></i>
          <span>Cámara apagada. Haz clic abajo para iniciar.</span>
        </div>`;
    }
    if (btnToggle) {
      btnToggle.innerHTML = `<i class="fa-solid fa-power-off"></i> Encender Cámara`;
      btnToggle.className = "w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2";
    }
  }
}

/**
 * Filtro validador contra duplicados en el mismo flujo
 */
function verificarDuplicadoHoy(codigo, modo) {
  return registroLocalMarcaciones.some(m => 
    m.codigo.trim().toUpperCase() === codigo.trim().toUpperCase() && 
    m.modo.toUpperCase() === modo.toUpperCase()
  );
}

function manejarEscaneoControlado(codigoLeido) {
  if (procesandoEscaneoQR) return;
  const codigoLimpio = codigoLeido.trim();

  // VALIDACIÓN DE DOBLE LECTURA EN EL MISMO MODO
  if (verificarDuplicadoHoy(codigoLimpio, modoActual)) {
    procesandoEscaneoQR = true;
    mostrarNotificacion(`⚠️ El código ${codigoLimpio} YA registró su ${modoActual} hoy.`, "bg-amber-100 text-amber-800 border-amber-300");
    
    // Reproducir una advertencia visual breve sin romper la cámara
    setTimeout(() => { procesandoEscaneoQR = false; }, 3000);
    return;
  }

  procesarMarcacion(codigoLimpio);
}

function procesarMarcacionManual(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('input-codigo-manual');
  if (!input) return;
  const codigo = input.value.trim();
  if (codigo) {
    manejarEscaneoControlado(codigo);
    input.value = '';
  }
}

async function procesarMarcacion(codigo) {
  procesandoEscaneoQR = true;
  if (!jornadaActiva) iniciarRegistro();

  // Pausar cámara durante el proceso para dar feedback visual claro
  if (html5QrcodeScanner && camaraEncendida) {
    try { await html5QrcodeScanner.stop(); camaraEncendida = false; actualizarEstadoCamaraUI(false); } catch (e) {}
  }

  const payload = {
    codigo: codigo,
    tipo: modoActual,
    fecha_hora: new Date().toISOString()
  };

  try {
    const response = await fetch('/api/asistencia/registrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const res = await response.json();

    if (response.ok && (res.success || res.ok)) {
      registrarMarcacionEnMemoria(codigo, modoActual);
      mostrarTarjetaResultado(res);
      abrirModalAsistencia(res);
    } else {
      mostrarNotificacion(`❌ Error: ${res.mensaje || 'Marcación inválida.'}`, "bg-rose-100 text-rose-800 border-rose-300");
      iniciarCamara();
    }
  } catch (error) {
    // Modo de contingencia offline local
    const fallbackData = {
      codigo: codigo,
      nombre: "Estudiante / Personal Local",
      aula: "Aula General",
      modo: modoActual,
      estado: modoActual === 'ENTRADA' ? 'PUNTUAL' : 'SALIDA REGISTRADA'
    };
    registrarMarcacionEnMemoria(codigo, modoActual);
    mostrarTarjetaResultado(fallbackData);
    abrirModalAsistencia(fallbackData);
  } finally {
    setTimeout(() => { procesandoEscaneoQR = false; }, 1500);
  }
}

function registrarMarcacionEnMemoria(codigo, modo) {
  registroLocalMarcaciones.push({ codigo, modo, timestamp: Date.now() });
}

function abrirModalAsistencia(data) {
  const modal = document.getElementById('modal-asistencia');
  if (!modal) return;

  const entidad = data.persona || data.alumno || data;
  const codigo = data.codigo || entidad.codigo || '-';
  const nombre = data.nombre || entidad.nombre_completo || 'Usuario Registrado';
  const aula = data.aula || entidad.aula || 'Asignación Regular';
  const hora = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  document.getElementById('modal-nombre').innerText = nombre;
  document.getElementById('modal-codigo').innerText = codigo;
  document.getElementById('modal-aula').innerText = aula;
  document.getElementById('modal-hora').innerText = hora;

  const iconContainer = document.getElementById('modal-icon-container');
  const icon = document.getElementById('modal-icon');
  const badgeEstado = document.getElementById('modal-estado');

  if (modoActual === 'SALIDA') {
    iconContainer.className = "w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl mb-4";
    icon.className = "fa-solid fa-right-from-bracket";
    badgeEstado.innerText = "SALIDA REGISTRADA";
    badgeEstado.className = "font-black px-2 py-0.5 rounded-md text-[10px] bg-indigo-100 text-indigo-800";
  } else {
    iconContainer.className = "w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center text-white text-2xl mb-4";
    icon.className = "fa-solid fa-check";
    badgeEstado.innerText = data.estado || "PUNTUAL";
    badgeEstado.className = "font-black px-2 py-0.5 rounded-md text-[10px] bg-emerald-100 text-emerald-800";
  }

  modal.classList.remove('hidden');
  setTimeout(() => { modal.classList.remove('opacity-0', 'pointer-events-none'); }, 10);
}

function cerrarModalAsistencia() {
  const modal = document.getElementById('modal-asistencia');
  if (!modal) return;
  modal.classList.add('opacity-0', 'pointer-events-none');
  setTimeout(() => {
    modal.classList.add('hidden');
    cargarAsistenciasHoy();
    if (!camaraEncendida) iniciarCamara();
  }, 300);
}

function mostrarTarjetaResultado(data) {
  const card = document.getElementById('resultado-card');
  if (!card) return;

  const nombre = data.nombre || 'Usuario Registrado';
  const codigo = data.codigo || '-';
  const aula = data.aula || 'Regular';
  const esSalida = modoActual === 'SALIDA';

  card.innerHTML = `
    <div class="flex flex-col items-center justify-center py-2 w-full">
      <div class="w-12 h-12 rounded-full ${esSalida ? 'bg-indigo-600' : 'bg-emerald-600'} text-white flex items-center justify-center font-black text-xl mb-2">
        ${nombre.charAt(0).toUpperCase()}
      </div>
      <h3 class="text-xs font-extrabold text-slate-800 text-center">${nombre}</h3>
      <p class="text-[11px] font-mono text-slate-500">${codigo} - ${aula}</p>
      <div class="mt-2 text-[10px] px-2 py-0.5 rounded bg-slate-200 font-bold">${modoActual} - ${new Date().toLocaleTimeString()}</div>
    </div>
  `;
}

function mostrarNotificacion(msj, clases) {
  const notif = document.getElementById('notificacion-alerta');
  if (!notif) return;
  notif.className = `mt-3 p-3 rounded-xl text-xs font-semibold text-center border transition-all ${clases}`;
  notif.innerText = msj;
  notif.classList.remove('hidden');
  setTimeout(() => { notif.classList.add('hidden'); }, 3500);
}

async function cargarAsistenciasHoy() {
  const tbody = document.getElementById('tabla-asistencias-hoy');
  if (!tbody) return;

  try {
    const res = await fetch('/api/asistencia/hoy');
    if (!res.ok) throw new Error();
    const datos = await res.json();
    tbody.innerHTML = '';

    // Sincronizar memoria antiduplicados con los datos existentes del servidor
    datos.forEach(row => {
      if (row.hora_entrada && row.hora_entrada !== '-') registrarMarcacionEnMemoria(row.codigo, 'ENTRADA');
      if (row.hora_salida && row.hora_salida !== '-') registrarMarcacionEnMemoria(row.codigo, 'SALIDA');
    });

    if (datos.length === 0) throw new Error();

    datos.forEach(row => {
      const tr = document.createElement('tr');
      tr.className = "hover:bg-slate-50 border-b border-slate-100";
      tr.innerHTML = `
        <td class="py-2 px-2.5 font-mono font-bold">${row.codigo || '-'}</td>
        <td class="py-2 px-2.5 font-semibold">${row.nombre || '-'}</td>
        <td class="py-2 px-2.5 text-slate-500">${row.aula || 'Regular'}</td>
        <td class="py-2 px-2.5 text-emerald-600 font-bold">${row.hora_entrada || '-'}</td>
        <td class="py-2 px-2.5 text-indigo-600 font-bold">${row.hora_salida || '-'}</td>
        <td class="py-2 px-2.5"><span class="px-1.5 py-0.5 rounded bg-slate-100 border text-[10px] font-bold">${row.estado || 'OK'}</span></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    // Fallback visual si la API está vacía temporalmente
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-slate-400">Sin marcaciones procesadas el día de hoy.</td></tr>`;
  }
}

function configurarEventosTeclado() {
  const inputManual = document.getElementById('input-codigo-manual');
  if (inputManual) {
    document.addEventListener('keydown', (e) => {
      if (document.activeElement !== inputManual && e.key !== 'Tab' && e.key !== 'Enter') {
        inputManual.focus();
      }
    });
  }
}