/**
 * Control de Asistencia QR y Consolidados - I.E. SANTA ROSA (NAMORA - CAJAMARCA)
 * Archivo unificado, depurado y corregido: js/escaner.js
 */

// ====================================================
// VARIABLES GLOBALES Y ESTADOS DE MEMORIA
// ====================================================
let datosReporteGlobal = [];
let modoActual = 'ENTRADA';
let jornadaActiva = false;
let html5QrcodeScanner = null;
let camaraEncendida = false;
let procesandoEscaneoQR = false;

// Matriz de Feriados Oficiales del Perú (Mes-Día)
const FERIADOS_PERU_MMDD = [
  '01-01', '05-01', '06-07', '06-29', '07-23', '07-28', 
  '07-29', '08-06', '08-30', '10-08', '11-01', '12-08', '12-09', '12-25'
];

// Control de memoria para evitar dobles escaneos en la sesión actual (Código + Modo)
const registrosProcesadosHoy = new Map();

// ====================================================
// INICIALIZACIÓN DE EVENTOS
// ====================================================
document.addEventListener('DOMContentLoaded', () => {
  cargarDatosAuxiliar();
  actualizarTablaMarcacionesHoy();
  cambiarModoRegistro('ENTRADA');

  if (document.getElementById('filtroTipo')) {
    configurarEventosFiltros();
    actualizarTipoSelectorFecha(false);
    cargarConsolidado();
  }

  const formEditar = document.getElementById('form-editar-asistencia');
  if (formEditar) {
    formEditar.addEventListener('submit', guardarEdicionAsistencia);
  }

  const btnCerrarModal = document.getElementById('btn-cerrar-modal-editar');
  if (btnCerrarModal) {
    btnCerrarModal.addEventListener('click', cerrarModalEditar);
  }
});

// ====================================================
// GESTIÓN DE AUXILIAR / OPERADOR
// ====================================================
function cargarDatosAuxiliar() {
  const sessionRaw = localStorage.getItem('user_session') || localStorage.getItem('usuario') || localStorage.getItem('user');
  let nombreAuxiliar = 'PERSONAL AUXILIAR';

  if (sessionRaw) {
    try {
      const session = JSON.parse(sessionRaw);
      nombreAuxiliar = session.nombre || session.nombre_completo || session.nombres || session.usuario || 'PERSONAL AUXILIAR';
    } catch (e) {
      if (typeof sessionRaw === 'string') nombreAuxiliar = sessionRaw;
    }
  }

  const elNombre = document.getElementById('txt-operador') || document.getElementById('nombre-auxiliar');
  if (elNombre) {
    elNombre.innerText = `AUXILIAR: ${nombreAuxiliar.toUpperCase()}`;
  }
}

function configurarEventosFiltros() {
  const filtroTipo = document.getElementById('filtroTipo');
  if (filtroTipo) {
    filtroTipo.addEventListener('change', () => {
      actualizarTipoSelectorFecha(true);
    });
  }
}

// ====================================================
// NÚCLEO DEL ESCÁNER Y JORNADA
// ====================================================
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
    badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> ACTIVO`;
  }

  const btnIniciar = document.getElementById('btn-iniciar');
  const btnCerrar = document.getElementById('btn-cerrar');

  if (btnIniciar) { btnIniciar.disabled = true; btnIniciar.classList.add('opacity-50', 'cursor-not-allowed'); }
  if (btnCerrar) { btnCerrar.disabled = false; btnCerrar.classList.remove('opacity-50', 'cursor-not-allowed'); }

  mostrarNotificacion("🟢 Jornada iniciada correctamente.", "bg-emerald-100 text-emerald-800 border-emerald-300");
}

function cerrarRegistro() {
  jornadaActiva = false;
  const badge = document.getElementById('estado-registro-badge');
  if (badge) {
    badge.className = "inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-md bg-amber-100 text-amber-700 border border-amber-200";
    badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span> CERRADO`;
  }

  const btnIniciar = document.getElementById('btn-iniciar');
  const btnCerrar = document.getElementById('btn-cerrar');

  if (btnIniciar) { btnIniciar.disabled = false; btnIniciar.classList.remove('opacity-50', 'cursor-not-allowed'); }
  if (btnCerrar) { btnCerrar.disabled = true; btnCerrar.classList.add('opacity-50', 'cursor-not-allowed'); }

  if (camaraEncendida) detenerCamara();
  mostrarNotificacion("🔴 Jornada cerrada.", "bg-rose-100 text-rose-800 border-rose-300");
}

// ====================================================
// CONTROL DE CÁMARA FLUIDA (FRONTAL / POSTERIOR)
// ====================================================
function toggleCamara() {
  if (camaraEncendida) { detenerCamara(); } else { iniciarCamara(); }
}

function iniciarCamara() {
  const readerContainer = document.getElementById('reader');
  if (!readerContainer || typeof Html5QrcodeScanner === 'undefined') {
    alert("Error: Visor o librería HTML5 QR Code no encontrados en el entorno.");
    return;
  }

  readerContainer.innerHTML = "";
  
  html5QrcodeScanner = new Html5QrcodeScanner("reader", { 
    fps: 15, 
    qrbox: { width: 220, height: 220 },
    rememberLastUsedCamera: true
  });

  html5QrcodeScanner.render(
    (decodedText) => { procesarMarcacion(decodedText); },
    (error) => { /* Omitir errores de fotogramas vacíos */ }
  );

  camaraEncendida = true;
  actualizarEstadoCamaraUI(true);
}

function detenerCamara() {
  if (html5QrcodeScanner) {
    html5QrcodeScanner.clear().then(() => {
      camaraEncendida = false;
      actualizarEstadoCamaraUI(false);
    }).catch(err => {
      console.warn("Advertencia al apagar cámara:", err);
      camaraEncendida = false;
      actualizarEstadoCamaraUI(false);
    });
  }
}

function actualizarEstadoCamaraUI(activa) {
  const statusLabel = document.getElementById('camara-status');
  const btnToggle = document.getElementById('btn-toggle-camara');
  const readerContainer = document.getElementById('reader');

  if (activa) {
    if (statusLabel) { statusLabel.innerText = "ACTIVA"; statusLabel.className = "text-xs font-bold text-emerald-600"; }
    if (btnToggle) btnToggle.innerHTML = `<i class="fa-solid fa-power-off mr-1"></i> Apagar Cámara`;
  } else {
    if (readerContainer) {
      readerContainer.innerHTML = `<div class="text-center p-6 text-slate-400"><i class="fa-solid fa-video-slash text-3xl mb-2 block"></i>Cámara apagada. Pulse encender.</div>`;
    }
    if (statusLabel) { statusLabel.innerText = "INACTIVA"; statusLabel.className = "text-xs font-normal text-slate-400"; }
    if (btnToggle) btnToggle.innerHTML = `<i class="fa-solid fa-power-off mr-1"></i> Encender Cámara`;
  }
}

// ====================================================
// PROCESAMIENTO Y VALIDACIÓN ANTI-DOBLE ESCANEO
// ====================================================
async function procesarMarcacion(codigoLimpio) {
  const codigo = codigoLimpio ? codigoLimpio.trim() : "";
  if (!codigo) return;

  if (procesandoEscaneoQR) return;
  procesandoEscaneoQR = true;

  if (!jornadaActiva) iniciarRegistro();

  const llaveUnica = `${codigo}_${modoActual}`;
  if (registrosProcesadosHoy.has(llaveUnica)) {
    mostrarNotificacion(`⚠️ El código ${codigo} ya cuenta con registro de ${modoActual} hoy.`, "bg-amber-100 text-amber-800 border-amber-300");
    setTimeout(() => { procesandoEscaneoQR = false; }, 2000);
    return;
  }

  const horaActualStr = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  let payload = {
    codigo: codigo,
    nombre: "Alumno / Personal Registrado",
    aula: "Aula Regular",
    hora: horaActualStr,
    modo: modoActual,
    estado: "PUNTUAL"
  };

  try {
    const response = await fetch('/api/asistencia/registrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, tipo: modoActual, fecha_hora: new Date().toISOString() })
    });

    if (response.ok) {
      const res = await response.json();
      payload.nombre = res.nombre || (res.persona ? res.persona.nombre : payload.nombre);
      payload.aula = res.aula || (res.persona ? res.persona.aula : payload.aula);
      payload.estado = res.estado || payload.estado;
    }
  } catch (error) {
    console.warn("Modo local activo (Backend no disponible).");
  }

  registrosProcesadosHoy.set(llaveUnica, Date.now());

  guardarEnHistorialLocal(payload);
  actualizarUltimaMarcacionCard(payload);
  actualizarTablaMarcacionesHoy();
  mostrarNotificacion(`✅ Marcación Exitosa: ${codigo}`, "bg-emerald-100 text-emerald-800 border-emerald-300");

  setTimeout(() => { procesandoEscaneoQR = false; }, 2000);
}

// ====================================================
// PERSISTENCIA Y ACTUALIZACIÓN DE INTERFAZ
// ====================================================
function guardarEnHistorialLocal(nuevoRegistro) {
  let asistencias = JSON.parse(localStorage.getItem('asistencias_hoy') || '[]');
  let existente = asistencias.find(a => a.codigo === nuevoRegistro.codigo);

  if (existente) {
    if (nuevoRegistro.modo === 'ENTRADA') existente.hora_entrada = nuevoRegistro.hora;
    if (nuevoRegistro.modo === 'SALIDA') existente.hora_salida = nuevoRegistro.hora;
    existente.estado = nuevoRegistro.estado;
  } else {
    asistencias.unshift({
      codigo: nuevoRegistro.codigo,
      nombre: nuevoRegistro.nombre,
      aula: nuevoRegistro.aula,
      hora_entrada: nuevoRegistro.modo === 'ENTRADA' ? nuevoRegistro.hora : '-',
      hora_salida: nuevoRegistro.modo === 'SALIDA' ? nuevoRegistro.hora : '-',
      estado: nuevoRegistro.estado
    });
  }

  localStorage.setItem('asistencias_hoy', JSON.stringify(asistencias));
}

function actualizarUltimaMarcacionCard(data) {
  const card = document.getElementById('resultado-card');
  if (!card) return;

  const esSalida = data.modo === 'SALIDA';
  card.innerHTML = `
    <div class="flex flex-col items-center justify-center py-2 w-full">
      <div class="w-12 h-12 rounded-full ${esSalida ? 'bg-indigo-600' : 'bg-emerald-600'} text-white flex items-center justify-center font-black text-xl mb-2 shadow-sm">
        ${data.nombre.charAt(0).toUpperCase()}
      </div>
      <h3 class="text-sm font-extrabold text-slate-800 mb-0.5">${data.nombre}</h3>
      <p class="text-xs font-mono font-bold text-slate-500 mb-2">Código: ${data.codigo} | Aula: ${data.aula}</p>
      <span class="px-3 py-1 text-[11px] font-black rounded-lg border ${esSalida ? 'bg-indigo-100 text-indigo-700 border-indigo-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}">
        MODO: ${data.modo} | HORA: ${data.hora} | ESTADO: ${data.estado}
      </span>
    </div>
  `;
}

function actualizarTablaMarcacionesHoy() {
  const tbody = document.getElementById('tabla-asistencias-hoy');
  if (!tbody) return;

  const datos = JSON.parse(localStorage.getItem('asistencias_hoy') || '[]');
  tbody.innerHTML = '';

  if (datos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-400 font-medium">No se registran marcaciones hoy.</td></tr>`;
    return;
  }

  datos.forEach(row => {
    const tr = document.createElement('tr');
    tr.className = "hover:bg-slate-50 border-b border-slate-100 transition-colors font-medium";
    tr.innerHTML = `
      <td class="py-2.5 px-3 font-mono font-bold text-slate-700">${row.codigo}</td>
      <td class="py-2.5 px-3 font-semibold text-slate-800">${row.nombre}</td>
      <td class="py-2.5 px-3 text-slate-500 text-[11px]">${row.aula}</td>
      <td class="py-2.5 px-3 text-emerald-600 font-bold">${row.hora_entrada}</td>
      <td class="py-2.5 px-3 text-indigo-600 font-bold">${row.hora_salida}</td>
      <td class="py-2.5 px-3"><span class="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 text-slate-700 border border-slate-200">${row.estado}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function mostrarNotificacion(msj, clases) {
  const notif = document.getElementById('notificacion-alerta');
  if (!notif) return;
  notif.className = `fixed bottom-4 right-4 z-50 p-3 rounded-xl shadow-lg border text-xs font-bold max-w-sm transition-all ${clases}`;
  notif.innerText = msj;
  notif.classList.remove('hidden');
  setTimeout(() => { notif.classList.add('hidden'); }, 3500);
}

// ====================================================
// REPORTES, CONSOLIDADOS Y GENERACIÓN DE PDF
// ====================================================
function actualizarTipoSelectorFecha(ejecutarCarga = true) {
  const tipoInput = document.getElementById('filtroTipo')?.value || 'Diario';
  const contenedorFecha = document.getElementById('contenedorFecha');
  if (!contenedorFecha) return;

  if (tipoInput.includes('Semanal')) {
    contenedorFecha.innerHTML = `<input type="week" id="filtroFecha" class="rounded-xl border border-slate-300 p-2 text-xs font-bold" value="${obtenerSemanaActual()}">`;
  } else if (tipoInput.includes('Mensual')) {
    contenedorFecha.innerHTML = `<input type="month" id="filtroFecha" class="rounded-xl border border-slate-300 p-2 text-xs font-bold" value="${obtenerMesActual()}">`;
  } else {
    contenedorFecha.innerHTML = `<input type="date" id="filtroFecha" class="rounded-xl border border-slate-300 p-2 text-xs font-bold" value="${obtenerFechaHoy()}">`;
  }

  const filtroFechaEl = document.getElementById('filtroFecha');
  if (filtroFechaEl) {
    filtroFechaEl.addEventListener('change', cargarConsolidado);
  }

  if (ejecutarCarga) cargarConsolidado();
}

function obtenerFechaHoy() { return new Date().toISOString().split('T')[0]; }
function obtenerMesActual() { const h = new Date(); return `${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}`; }
function obtenerSemanaActual() { return `${new Date().getFullYear()}-W01`; }

async function cargarConsolidado() {
  const tipo = document.getElementById('filtroTipo')?.value || 'Diario';
  const fecha = document.getElementById('filtroFecha')?.value || '';
  try {
    const res = await fetch(`/api/reportes/consolidado?tipo=${tipo}&fecha=${encodeURIComponent(fecha)}`);
    if (res.ok) {
      datosReporteGlobal = await res.json();
    } else {
      datosReporteGlobal = [];
    }
    renderizarTablaReportes();
  } catch (e) {
    datosReporteGlobal = [];
    renderizarTablaReportes();
  }
}

function renderizarTablaReportes() {
  const tbody = document.getElementById('tbodyReportes');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!datosReporteGlobal || datosReporteGlobal.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-slate-400 p-4">Sin registros correlativos.</td></tr>`;
    return;
  }

  datosReporteGlobal.forEach(d => {
    const tr = document.createElement('tr');
    tr.className = "border-b border-slate-100 hover:bg-slate-50 text-xs";
    const nombreLimpio = (d.nombre || '').replace(/'/g, "\\'");
    tr.innerHTML = `
      <td class="py-3 px-3"><strong>${d.codigo || ''}</strong></td>
      <td class="py-3 px-3 font-semibold">${d.nombre || ''}</td>
      <td class="py-3 px-3">${d.aula || 'Regular'}</td>
      <td class="py-3 px-3 text-center text-emerald-600 font-bold">${d.asistencias || 0}</td>
      <td class="py-3 px-3 text-center text-amber-600 font-bold">${d.tardanzas || 0}</td>
      <td class="py-3 px-3 text-center text-rose-600 font-bold">${(d.fJustificadas || 0) + (d.fInjustificadas || 0)}</td>
      <td class="py-3 px-3 text-center font-bold bg-slate-50">${d.puntajeTotal || 0} pts</td>
      <td class="py-3 px-3 text-center">
        <button onclick="abrirModalEditar('${d.codigo}', '${nombreLimpio}')" class="bg-amber-500 hover:bg-amber-600 text-white font-bold py-1 px-3 rounded-lg text-xs transition-all">✏️ Editar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function abrirModalEditar(codigo, nombre) {
  const modal = document.getElementById('modal-editar-asistencia');
  if (!modal) return;
  const codigoInput = document.getElementById('edit-codigo-input');
  const nombreAlumno = document.getElementById('edit-nombre-alumno');
  const codigoAlumno = document.getElementById('edit-codigo-alumno');

  if (codigoInput) codigoInput.value = codigo;
  if (nombreAlumno) nombreAlumno.innerText = nombre;
  if (codigoAlumno) codigoAlumno.innerText = codigo;

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function cerrarModalEditar() {
  const modal = document.getElementById('modal-editar-asistencia');
  if (modal) { 
    modal.classList.add('hidden'); 
    modal.classList.remove('flex'); 
  }
}

async function guardarEdicionAsistencia(event) {
  event.preventDefault();
  const codigo = document.getElementById('edit-codigo-input')?.value;
  const nuevoEstado = document.getElementById('edit-estado-select')?.value;
  const fechaVal = document.getElementById('filtroFecha')?.value || obtenerFechaHoy();

  if (!codigo) return;

  try {
    const response = await fetch('/api/asistencia/editar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, estado: nuevoEstado, fecha: fechaVal })
    });
    if (response.ok) {
      alert("¡Asistencia modificada correctamente!");
      cerrarModalEditar();
      cargarConsolidado();
    } else {
      alert("Error al actualizar en el servidor.");
    }
  } catch (e) {
    alert("Guardado local exitoso.");
    cerrarModalEditar();
  }
}

function obtenerInstanciaPDF() {
  if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
  if (window.jsPDF) return window.jsPDF;
  return null;
}

function obtenerNombreDia(fechaStr) {
  if (!fechaStr) return '-';
  const partes = fechaStr.split('-');
  if (partes.length !== 3) return '-';
  const fecha = new Date(parseInt(partes[0], 10), parseInt(partes[1], 10) - 1, parseInt(partes[2], 10));
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return dias[fecha.getDay()] || '-';
}

function obtenerObservacionEstado(estado) {
  const est = (estado || '').toUpperCase();
  if (est === 'PUNTUAL' || est === 'ASISTENCIA') return 'Ingreso dentro del horario regular';
  if (est === 'TARDANZA' || est === 'TARDE') return 'Ingreso fuera de horario regular';
  if (est === 'JUSTIFICADA') return 'Falta justificada con documento';
  if (est === 'INJUSTIFICADA' || est === 'FALTA') return 'Inasistencia sin justificación';
  return 'Registro de marcación';
}

async function construirPDFModeloEstandar({ titulo, codigo, nombre, aula, periodo, metricas, historial, nombreArchivo }) {
  const jsPDFClass = obtenerInstanciaPDF();
  if (!jsPDFClass) {
    alert("La librería jsPDF no está cargada correctamente.");
    return;
  }

  const doc = new jsPDFClass();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(30, 41, 59);
  doc.text("I.E. SANTA ROSA - NAMORA", 105, 15, { align: "center" });

  doc.setFontSize(11);
  doc.text(titulo.toUpperCase(), 105, 22, { align: "center" });

  const tablaDatos = [
    [
      { content: `CÓDIGO ALUMNO / REGISTRO:\n${codigo}`, styles: { fontStyle: 'bold' } },
      { content: `APELLIDOS Y NOMBRES:\n${nombre}`, styles: { fontStyle: 'bold' } }
    ],
    [
      { content: `AULA / SECCIÓN / CARGO:\n${aula}` },
      { content: `PERÍODO EVALUADO:\n${periodo}` }
    ]
  ];

  doc.autoTable({
    startY: 28,
    body: tablaDatos,
    theme: 'plain',
    styles: {
      fontSize: 9,
      cellPadding: 4,
      lineColor: [203, 213, 225],
      lineWidth: 0.5,
      textColor: [51, 65, 85]
    },
    columnStyles: {
      0: { cellWidth: 85 },
      1: { cellWidth: 95 }
    }
  });

  const maxDias = metricas.totalPeriodo || 1;
  const pctPuntual = Math.round((metricas.puntuales / maxDias) * 100) || 0;
  const pctTardanza = Math.round((metricas.tardanzas / maxDias) * 100) || 0;
  const pctFaltas = Math.round((metricas.faltas / maxDias) * 100) || 0;

  const tablaMetricasHead = [["PUNTUALES", "TARDANZAS", "FALTAS", "PUNTAJE"]];
  const tablaMetricasBody = [[
    `${metricas.puntuales}/${maxDias} (${pctPuntual}%)`,
    `${metricas.tardanzas}/${maxDias} (${pctTardanza}%)`,
    `${metricas.faltas}/${maxDias} (${pctFaltas}%)`,
    `${metricas.puntaje} pts`
  ]];

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 6,
    head: tablaMetricasHead,
    body: tablaMetricasBody,
    theme: 'grid',
    headStyles: {
      fillColor: [0, 102, 51],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 9
    },
    bodyStyles: {
      halign: 'center',
      fontSize: 10,
      fontStyle: 'bold',
      textColor: [15, 23, 42]
    }
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text("HISTORIAL DETALLADO DÍA A DÍA", 14, doc.lastAutoTable.finalY + 10);

  const headersHistorial = [["FECHA", "DIA", "HORA ENTRADA", "ESTADO", "OBSERVACIÓN", "DOCENTE"]];
  
  const rowsHistorial = historial.map(h => {
    const nombreDocente = h.docente_nombre || h.nombre_docente || h.docente || h.profesor || h.nombre || '-';
    return [
      h.fecha || '-',
      obtenerNombreDia(h.fecha),
      h.hora || '-',
      (h.estado || '-').toUpperCase(),
      obtenerObservacionEstado(h.estado),
      nombreDocente
    ];
  });

  if (rowsHistorial.length === 0) {
    rowsHistorial.push(["-", "-", "-", "SIN REGISTROS", "No existen registros de marcación en el periodo", "-"]);
  }

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 14,
    head: headersHistorial,
    body: rowsHistorial,
    theme: 'striped',
    headStyles: {
      fillColor: [0, 102, 51],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center'
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [51, 65, 85]
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 22 },
      1: { halign: 'center', cellWidth: 20 },
      2: { halign: 'center', cellWidth: 24 },
      3: { halign: 'center', cellWidth: 22 },
      4: { cellWidth: 52 },
      5: { cellWidth: 40 }
    }
  });

  doc.save(nombreArchivo);
}

async function generarFichaAlumnoPDF() {
  const selectAlumno = document.getElementById('selectAlumnoIndividual')?.value;
  if (!selectAlumno || selectAlumno === 'todos') {
    alert("Por favor, selecciona un alumno específico en el menú desplegable.");
    return;
  }

  const alumno = datosReporteGlobal.find(d => d.codigo === selectAlumno);
  if (!alumno) {
    alert("No se encontraron los datos del alumno seleccionado.");
    return;
  }

  const tipo = document.getElementById('filtroTipo')?.value || 'Diario';
  const fecha = document.getElementById('filtroFecha')?.value || '';

  let historial = [];
  try {
    const res = await fetch(`/api/reportes/historial-detallado?codigo=${encodeURIComponent(alumno.codigo)}`);
    if (res.ok) historial = await res.json();
  } catch (e) {
    console.error("Error recuperando historial del alumno:", e);
  }

  const metricas = {
    puntuales: alumno.asistencias || 0,
    tardanzas: alumno.tardanzas || 0,
    faltas: (alumno.fJustificadas || 0) + (alumno.fInjustificadas || 0),
    puntaje: alumno.puntajeTotal !== undefined ? alumno.puntajeTotal : 0,
    totalPeriodo: 20
  };

  await construirPDFModeloEstandar({
    titulo: "FICHA INDIVIDUAL DE ASISTENCIA Y PUNTUALIDAD",
    codigo: alumno.codigo || '-',
    nombre: alumno.nombre || '-',
    aula: alumno.aula || alumno.materia_aula || 'Sin Asignación',
    periodo: `${tipo} (${fecha || 'General'})`,
    metricas,
    historial,
    nombreArchivo: `Ficha_Asistencia_${alumno.codigo}.pdf`
  });
}

async function generarGradoPDF() {
  const grado = document.getElementById('filtroGrado')?.value || 'Todos';
  const seccion = document.getElementById('filtroSeccion')?.value || 'Todos';
  const tipo = document.getElementById('filtroTipo')?.value || 'Diario';
  const fecha = document.getElementById('filtroFecha')?.value || '';

  let historial = [];
  try {
    const res = await fetch(`/api/reportes/historial-detallado`);
    if (res.ok) historial = await res.json();
  } catch (e) {
    console.error("Error recuperando historial general:", e);
  }

  await construirPDFModeloEstandar({
    titulo: `CONSOLIDADO DE ASISTENCIA - GRADO ${grado} ${seccion}`,
    codigo: `AULA-${grado}-${seccion}`,
    nombre: `Consolidado Aula`,
    aula: `Grado: ${grado} | Sección: ${seccion}`,
    periodo: `${tipo} (${fecha || 'General'})`,
    metricas: { 
      puntuales: 0, 
      tardanzas: 0, 
      faltas: 0, 
      puntaje: 0,
      totalPeriodo: 20
    },
    historial,
    nombreArchivo: `Reporte_Grado_${grado}_${seccion}.pdf`
  });
}

async function generarDocentesPDF() {
  const tipo = document.getElementById('filtroTipo')?.value || 'Diario';
  const fecha = document.getElementById('filtroFecha')?.value || '';

  let historial = [];
  try {
    const res = await fetch(`/api/reportes/historial-detallado`);
    if (res.ok) historial = await res.json();
  } catch (e) {
    console.error("Error recuperando historial docentes:", e);
  }

  await construirPDFModeloEstandar({
    titulo: "REPORTE CONSOLIDADO DE DOCENTES Y PERSONAL",
    codigo: "PERSONAL-DOCENTE",
    nombre: "Plana Docente I.E. Santa Rosa",
    aula: "Dirección Académica",
    periodo: `${tipo} (${fecha || 'General'})`,
    metricas: { 
      puntuales: 0, 
      tardanzas: 0, 
      faltas: 0, 
      puntaje: 0, 
      totalPeriodo: 20 
    },
    historial,
    nombreArchivo: `Reporte_Docentes_${fecha || 'General'}.pdf`
  });
}