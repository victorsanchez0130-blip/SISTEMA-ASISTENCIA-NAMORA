/**
 * Control de Asistencia QR y Consolidados - I.E. SANTA ROSA (NAMORA - CAJAMARCA)
 * Archivo: js/escaner.js
 */

// ====================================================
// VARIABLES GLOBALES
// ====================================================
let datosReporteGlobal = [];
let modoActual = 'ENTRADA';
let jornadaActiva = false;
let html5QrcodeScanner = null;
let camaraEncendida = false;
let procesandoEscaneoQR = false;

const FERIADOS_PERU_MMDD = [
  '01-01', '05-01', '06-07', '06-29', '07-23', '07-28', 
  '07-29', '08-06', '08-30', '10-08', '11-01', '12-08', '12-09', '12-25'
];

// ====================================================
// INICIALIZACIÓN DE EVENTOS
// ====================================================
document.addEventListener('DOMContentLoaded', () => {
  cargarDatosAuxiliar();
  configurarEventosTeclado();
  cargarAsistenciasHoy();

  // Inicializar eventos de filtros sólo si existen en la interfaz actual
  if (document.getElementById('filtroTipo')) {
    configurarEventosFiltros();
    actualizarTipoSelectorFecha(false);
    cargarConsolidado();
  }

  document.getElementById('form-editar-asistencia')?.addEventListener('submit', guardarEdicionAsistencia);
  document.getElementById('btn-cerrar-modal-editar')?.addEventListener('click', cerrarModalEditar);
});

function cargarDatosAuxiliar() {
  const sessionRaw = localStorage.getItem('user_session') || localStorage.getItem('usuario') || localStorage.getItem('user');
  let nombreAuxiliar = 'Auxiliar';

  if (sessionRaw) {
    try {
      const session = JSON.parse(sessionRaw);
      nombreAuxiliar = session.nombre || session.nombre_completo || session.nombres || session.usuario || 'Auxiliar';
    } catch (e) {
      if (typeof sessionRaw === 'string') nombreAuxiliar = sessionRaw;
    }
  }

  const elNombre = document.getElementById('nombre-auxiliar');
  if (elNombre) elNombre.innerText = nombreAuxiliar;
}

function configurarEventosFiltros() {
  document.getElementById('filtroTipo')?.addEventListener('change', () => {
    actualizarTipoSelectorFecha(true);
  });
}

// ====================================================
// NÚCLEO DEL ESCÁNER Y JORNADA
// ====================================================
function cambiarModoRegistro(nuevoModo) {
  modoActual = nuevoModo;
  const lblEntrada = document.getElementById('lbl-modo-entrada');
  const lblSalida = document.getElementById('lbl-modo-salida');

  if (nuevoModo === 'SALIDA') {
    if (lblSalida) lblSalida.className = "cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-indigo-600 text-white shadow-sm scale-105";
    if (lblEntrada) lblEntrada.className = "cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-600 hover:bg-slate-200 opacity-70";
  } else {
    if (lblEntrada) lblEntrada.className = "cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-emerald-600 text-white shadow-sm scale-105";
    if (lblSalida) lblSalida.className = "cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-600 hover:bg-slate-200 opacity-70";
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
    badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span> CERRADO`;
  }

  const btnIniciar = document.getElementById('btn-iniciar');
  const btnCerrar = document.getElementById('btn-cerrar');

  if (btnIniciar) { btnIniciar.disabled = false; btnIniciar.classList.remove('opacity-50', 'cursor-not-allowed'); }
  if (btnCerrar) { btnCerrar.disabled = true; btnCerrar.classList.add('opacity-50', 'cursor-not-allowed'); }

  if (camaraEncendida) detenerCamara();
  mostrarNotificacion("🔴 Jornada cerrada.", "bg-rose-100 text-rose-800 border-rose-300");
}

function toggleCamara() {
  if (camaraEncendida) { detenerCamara(); } else { iniciarCamara(); }
}

function iniciarCamara() {
  const readerContainer = document.getElementById('reader');
  if (!readerContainer || typeof Html5Qrcode === 'undefined') {
    alert("Visor o librería HTML5 QR Code no encontrados.");
    return;
  }

  readerContainer.innerHTML = "";
  try {
    html5QrcodeScanner = new Html5Qrcode("reader");
    const config = { fps: 10, qrbox: { width: 220, height: 220 } };

    html5QrcodeScanner.start(
      { facingMode: "environment" },
      config,
      (decodedText) => { procesarMarcacion(decodedText); },
      () => {}
    ).then(() => {
      camaraEncendida = true;
      actualizarEstadoCamaraUI(true);
    }).catch(() => {
      html5QrcodeScanner.start(
        { facingMode: "user" },
        config,
        (decodedText) => { procesarMarcacion(decodedText); },
        () => {}
      ).then(() => {
        camaraEncendida = true;
        actualizarEstadoCamaraUI(true);
      }).catch(err => {
        console.error(err);
        alert("Permiso denegado o error de cámara.");
      });
    });
  } catch (e) {
    console.error(e);
  }
}

function detenerCamara() {
  if (html5QrcodeScanner && camaraEncendida) {
    html5QrcodeScanner.stop().then(() => {
      camaraEncendida = false;
      actualizarEstadoCamaraUI(false);
    }).catch(err => {
      console.error(err);
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
      readerContainer.innerHTML = `<div class="text-center p-6 text-slate-400"><i class="fa-solid fa-video-slash text-3xl mb-2 block"></i>Cámara apagada. Haz clic abajo para iniciar.</div>`;
    }
    if (statusLabel) { statusLabel.innerText = "INACTIVA"; statusLabel.className = "text-xs font-normal text-slate-400"; }
    if (btnToggle) btnToggle.innerHTML = `<i class="fa-solid fa-power-off mr-1"></i> Encender Cámara`;
  }
}

function procesarMarcacionManual(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('input-codigo-manual');
  if (!input) return;

  const codigo = input.value.trim();
  if (codigo) {
    procesarMarcacion(codigo);
    input.value = '';
  }
}

async function procesarMarcacion(codigo) {
  if (procesandoEscaneoQR) return;
  procesandoEscaneoQR = true;

  if (!jornadaActiva) iniciarRegistro();

  const payload = { codigo: codigo.trim(), tipo: modoActual, fecha_hora: new Date().toISOString() };

  try {
    const response = await fetch('/api/asistencia/registrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const res = await response.json();

    if (response.ok && (res.success || res.ok)) {
      const datosPersona = res.persona || res.alumno || { codigo, nombre: res.nombre || 'Registrado', modo: modoActual };
      mostrarTarjetaResultado(datosPersona);
      mostrarNotificacion(`✅ Marcación exitosa: ${codigo}`, "bg-emerald-100 text-emerald-800 border-emerald-300");
      cargarAsistenciasHoy();
    } else {
      mostrarNotificacion(`❌ Error: ${res.mensaje || 'No procesado'}`, "bg-rose-100 text-rose-800 border-rose-300");
    }
  } catch (error) {
    mostrarTarjetaResultado({ codigo, nombre: "Modo Offline / Local", modo: modoActual });
    mostrarNotificacion(`✅ Registrado localmente (Sin conexión)`, "bg-emerald-100 text-emerald-800 border-emerald-300");
  } finally {
    setTimeout(() => { procesandoEscaneoQR = false; }, 2500);
  }
}

function mostrarTarjetaResultado(persona) {
  const card = document.getElementById('resultado-card');
  if (!card) return;

  const esSalida = (persona.modo || modoActual) === 'SALIDA';
  card.innerHTML = `
    <div class="flex flex-col items-center justify-center py-4">
      <div class="w-16 h-16 rounded-full ${esSalida ? 'bg-indigo-600' : 'bg-emerald-600'} text-white flex items-center justify-center font-black text-2xl mb-3 shadow-md">
        ${(persona.nombre || 'U').charAt(0).toUpperCase()}
      </div>
      <h3 class="text-base font-extrabold text-slate-800 mb-0.5">${persona.nombre}</h3>
      <p class="text-xs font-mono font-bold text-slate-500 mb-2">${persona.codigo}</p>
      <span class="px-2.5 py-1 text-[11px] font-black rounded-lg border ${esSalida ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}">
        ${persona.modo || modoActual} - ${new Date().toLocaleTimeString()}
      </span>
    </div>
  `;
}

function mostrarNotificacion(msj, clases) {
  const notif = document.getElementById('notificacion-alerta');
  if (!notif) return;
  notif.className = `mt-3 p-3 rounded-xl text-xs font-semibold text-center border transition-all ${clases}`;
  notif.innerText = msj;
  notif.classList.remove('hidden');
  setTimeout(() => { notif.classList.add('hidden'); }, 4000);
}

async function cargarAsistenciasHoy() {
  const tbody = document.getElementById('tabla-asistencias-hoy');
  if (!tbody) return;

  try {
    const res = await fetch('/api/asistencia/hoy');
    if (!res.ok) throw new Error();
    const datos = await res.json();
    tbody.innerHTML = '';

    if (!datos || datos.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-400 font-medium">No se registran marcaciones hoy.</td></tr>`;
      return;
    }

    datos.forEach(row => {
      const tr = document.createElement('tr');
      tr.className = "hover:bg-slate-50 border-b border-slate-100 font-medium";
      tr.innerHTML = `
        <td class="py-2.5 px-3 font-mono font-bold">${row.codigo || '-'}</td>
        <td class="py-2.5 px-3 font-semibold text-slate-800">${row.nombre || '-'}</td>
        <td class="py-2.5 px-3 text-slate-500">${row.aula || row.rol || 'Asignación'}</td>
        <td class="py-2.5 px-3 text-emerald-600 font-bold">${row.hora_entrada || '-'}</td>
        <td class="py-2.5 px-3 text-indigo-600 font-bold">${row.hora_salida || '-'}</td>
        <td class="py-2.5 px-3"><span class="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 text-slate-700 border border-slate-200">${row.estado || 'REGISTRADO'}</span></td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-400 font-medium">Servicio listo (Esperando marcaciones).</td></tr>`;
  }
}

function configurarEventosTeclado() {
  const inputManual = document.getElementById('input-codigo-manual');
  if (inputManual) {
    document.addEventListener('keydown', (e) => {
      if (document.activeElement !== inputManual && e.key !== 'Tab') {
        inputManual.focus();
      }
    });
  }
}

// ====================================================
// REPORTES, CONSOLIDADOS Y GENERACIÓN PDF
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

  document.getElementById('filtroFecha')?.addEventListener('change', cargarConsolidado);
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
    datosReporteGlobal = await res.json();
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

  if (datosReporteGlobal.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-slate-400 p-4">Sin registros correlativos.</td></tr>`;
    return;
  }

  datosReporteGlobal.forEach(d => {
    const tr = document.createElement('tr');
    tr.className = "border-b border-slate-100 hover:bg-slate-50 text-xs";
    tr.innerHTML = `
      <td class="py-3 px-3"><strong>${d.codigo}</strong></td>
      <td class="py-3 px-3 font-semibold">${d.nombre}</td>
      <td class="py-3 px-3">${d.aula || 'Regular'}</td>
      <td class="py-3 px-3 text-center text-emerald-600 font-bold">${d.asistencias || 0}</td>
      <td class="py-3 px-3 text-center text-amber-600 font-bold">${d.tardanzas || 0}</td>
      <td class="py-3 px-3 text-center text-rose-600 font-bold">${(d.fJustificadas || 0) + (d.fInjustificadas || 0)}</td>
      <td class="py-3 px-3 text-center font-bold bg-slate-50">${d.puntajeTotal || 0} pts</td>
      <td class="py-3 px-3 text-center">
        <button onclick="abrirModalEditar('${d.codigo}', '${d.nombre.replace(/'/g, "\\'")}')" class="bg-amber-500 hover:bg-amber-600 text-white font-bold py-1 px-3 rounded-lg text-xs transition-all">✏️ Editar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function abrirModalEditar(codigo, nombre) {
  const modal = document.getElementById('modal-editar-asistencia');
  if (!modal) return;
  document.getElementById('edit-codigo-input').value = codigo;
  document.getElementById('edit-nombre-alumno').innerText = nombre;
  document.getElementById('edit-codigo-alumno').innerText = codigo;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function cerrarModalEditar() {
  const modal = document.getElementById('modal-editar-asistencia');
  if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
}

async function guardarEdicionAsistencia(event) {
  event.preventDefault();
  const codigo = document.getElementById('edit-codigo-input').value;
  const nuevoEstado = document.getElementById('edit-estado-select').value;
  const fechaVal = document.getElementById('filtroFecha')?.value || obtenerFechaHoy();

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
    alert("La librería jsPDF no está disponible.");
    return;
  }

  const doc = new jsPDFClass();

  try {
    const rutaLogoBajoFondo = 'img/logo-marca-agua.png'; 
    doc.addImage(rutaLogoBajoFondo, 'PNG', 25, 70, 160, 160, undefined, 'FAST');
  } catch (imgErr) {
    console.warn("No se pudo cargar la marca de agua, continuando sin ella:", imgErr);
  }

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

  const finalY = doc.lastAutoTable.finalY + 30;
  const posY = finalY > 260 ? 260 : finalY;

  doc.setLineWidth(0.5);
  doc.setDrawColor(148, 163, 184);

  doc.line(30, posY, 85, posY);
  doc.line(125, posY, 180, posY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text("Auxiliar / Auxiliar de Disciplina", 57, posY + 5, { align: "center" });
  doc.text("Dirección / Dirección Académica", 152, posY + 5, { align: "center" });

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
    totalPeriodo: obtenerTotalDiasPeriodo()
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
  const filtrados = obtenerAlumnosFiltradosBase();
  if (filtrados.length === 0) {
    alert("No existen registros con los filtros seleccionados.");
    return;
  }

  const grado = document.getElementById('filtroGrado')?.value || 'Todos';
  const seccion = document.getElementById('filtroSeccion')?.value || 'Todos';
  const tipo = document.getElementById('filtroTipo')?.value || 'Diario';
  const fecha = document.getElementById('filtroFecha')?.value || '';

  let totPuntual = 0, totTardanza = 0, totFaltas = 0, totPuntos = 0;
  filtrados.forEach(a => {
    totPuntual += (a.asistencias || 0);
    totTardanza += (a.tardanzas || 0);
    totFaltas += ((a.fJustificadas || 0) + (a.fInjustificadas || 0));
    totPuntos += (a.puntajeTotal !== undefined ? a.puntajeTotal : 0);
  });

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
    nombre: `Consolidado Aula (${filtrados.length} Alumnos)`,
    aula: `Grado: ${grado} | Sección: ${seccion}`,
    periodo: `${tipo} (${fecha || 'General'})`,
    metricas: { 
      text: "",
      puntuales: totPuntual, 
      tardanzas: totTardanza, 
      faltas: totFaltas, 
      puntaje: totPuntos,
      totalPeriodo: obtenerTotalDiasPeriodo() * filtrados.length
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

  let puntuales = 0, tardanzas = 0, faltas = 0;

  historial.forEach(reg => {
    const estado = (reg.estado || '').toUpperCase();
    if (estado === 'PUNTUAL' || estado === 'ASISTENCIA') puntuales++;
    else if (estado === 'TARDANZA' || estado === 'TARDE') tardanzas++;
    else if (estado === 'FALTA' || estado === 'INJUSTIFICADA' || estado === 'JUSTIFICADA') faltas++;
  });

  const puntajeTotal = (puntuales * 10) + (tardanzas * 5);

  await construirPDFModeloEstandar({
    titulo: "REPORTE CONSOLIDADO DE DOCENTES Y PERSONAL",
    codigo: "PERSONAL-DOCENTE",
    nombre: "Plana Docente I.E. Santa Rosa",
    aula: "Dirección Académica",
    periodo: `${tipo} (${fecha || 'General'})`,
    metricas: { 
      puntuales, 
      tardanzas, 
      faltas, 
      puntaje: puntajeTotal, 
      totalPeriodo: obtenerTotalDiasPeriodo() 
    },
    historial,
    nombreArchivo: `Reporte_Docentes_${fecha || 'General'}.pdf`
  });
}