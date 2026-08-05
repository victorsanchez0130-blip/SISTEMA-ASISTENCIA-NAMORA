// Variable global para almacenar los datos del consolidado recuperados de la API
let datosReporteGlobal = [];

/**
 * Lista de feriados nacionales estandarizados en Perú (MM-DD)
 */
const FERIADOS_PERU_MMDD = [
  '01-01', // Año Nuevo
  '05-01', // Día del Trabajo
  '06-07', // Batalla de Arica y Día de la Bandera
  '06-29', // San Pedro y San Pablo
  '07-23', // Día de la Fuerza Aérea del Perú
  '07-28', // Fiestas Patrias
  '07-29', // Fiestas Patrias
  '08-06', // Batalla de Junín
  '08-30', // Santa Rosa de Lima
  '10-08', // Combate de Angamos
  '11-01', // Día de Todos los Santos
  '12-08', // Inmaculada Concepción
  '12-09', // Batalla de Ayacucho
  '12-25'  // Navidad
];

document.addEventListener('DOMContentLoaded', () => {
  configurarEventosFiltros();
  actualizarTipoSelectorFecha();
});

// ----------------------------------------------------
// CAMBIO DINÁMICO DEL INPUT DE FECHA Y CÁLCULO DE DÍAS
// ----------------------------------------------------

function actualizarTipoSelectorFecha() {
  const tipoInput = document.getElementById('filtroTipo')?.value || 'Reporte Diario';
  const contenedorFecha = document.getElementById('filtroFecha')?.parentElement;
  
  if (!contenedorFecha) return;

  if (tipoInput.includes('Semanal')) {
    contenedorFecha.innerHTML = `<input type="week" id="filtroFecha" class="form-control" value="${obtenerSemanaActual()}">`;
  } else if (tipoInput.includes('Mensual')) {
    contenedorFecha.innerHTML = `<input type="month" id="filtroFecha" class="form-control" value="${obtenerMesActual()}">`;
  } else {
    contenedorFecha.innerHTML = `<input type="date" id="filtroFecha" class="form-control" value="${obtenerFechaHoy()}">`;
  }

  document.getElementById('filtroFecha')?.addEventListener('change', cargarConsolidado);
  cargarConsolidado();
}

function obtenerFechaHoy() {
  const hoy = new Date();
  return hoy.toISOString().split('T')[0];
}

function obtenerSemanaActual() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${weekNo < 10 ? '0' + weekNo : weekNo}`;
}

function obtenerMesActual() {
  const hoy = new Date();
  const mes = hoy.getMonth() + 1;
  return `${hoy.getFullYear()}-${mes < 10 ? '0' + mes : mes}`;
}

/**
 * Verifica si una fecha dada en formato Date es un día laborable (Lunes a Viernes y NO feriado)
 */
function esDiaLaborable(fecha) {
  const dayOfWeek = fecha.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false; // Excluir Sábados (6) y Domingos (0)

  const mesStr = String(fecha.getMonth() + 1).padStart(2, '0');
  const diaStr = String(fecha.getDate()).padStart(2, '0');
  const claveMMDD = `${mesStr}-${diaStr}`;

  return !FERIADOS_PERU_MMDD.includes(claveMMDD);
}

/**
 * Retorna el número exacto de días lectivos del periodo descartando fines de semana y feriados.
 */
function obtenerTotalDiasPeriodo() {
  const tipoInput = document.getElementById('filtroTipo')?.value || 'Reporte Diario';
  const fechaVal = document.getElementById('filtroFecha')?.value || '';

  // 1. REPORTE DIARIO
  if (!tipoInput.includes('Semanal') && !tipoInput.includes('Mensual')) {
    if (!fechaVal) return 1;
    const [a, m, d] = fechaVal.split('-').map(Number);
    const fechaObj = new Date(a, m - 1, d);
    return esDiaLaborable(fechaObj) ? 1 : 0;
  }

  // 2. REPORTE SEMANAL
  if (tipoInput.includes('Semanal')) {
    if (!fechaVal) return 5;
    
    // Parsear semana ISO (Ej: "2026-W28")
    const partes = fechaVal.split('-W');
    if (partes.length !== 2) return 5;

    const anio = Number(partes[0]);
    const semana = Number(partes[1]);

    // Calcular el Lunes de dicha semana ISO
    const simple = new Date(anio, 0, 1 + (semana - 1) * 7);
    const dow = simple.getDay();
    const ISOweekStart = simple;
    if (dow <= 4)
      ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
    else
      ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());

    let diasLectivos = 0;
    for (let i = 0; i < 5; i++) { // De Lunes a Viernes
      const diaActual = new Date(ISOweekStart);
      diaActual.setDate(ISOweekStart.getDate() + i);
      if (esDiaLaborable(diaActual)) {
        diasLectivos++;
      }
    }
    return diasLectivos;
  }

  // 3. REPORTE MENSUAL
  if (tipoInput.includes('Mensual')) {
    if (!fechaVal) return 22;
    
    const [anio, mes] = fechaVal.split('-').map(Number);
    if (!anio || !mes) return 22;

    let diasLectivos = 0;
    const totalDiasMes = new Date(anio, mes, 0).getDate();

    for (let dia = 1; dia <= totalDiasMes; dia++) {
      const fechaObj = new Date(anio, mes - 1, dia);
      if (esDiaLaborable(fechaObj)) {
        diasLectivos++;
      }
    }
    return diasLectivos;
  }

  return 1;
}

// ----------------------------------------------------
// CARGA Y CONSULTA DE DATOS DESDE EL SERVIDOR
// ----------------------------------------------------

async function cargarConsolidado() {
  const tipoInput = document.getElementById('filtroTipo')?.value || 'Diario';
  const fechaVal = document.getElementById('filtroFecha')?.value || '';

  let tipo = 'Diario';
  if (tipoInput.includes('Semanal')) tipo = 'Semanal';
  if (tipoInput.includes('Mensual')) tipo = 'Mensual';

  try {
    const res = await fetch(`/api/reportes/consolidado?tipo=${tipo}&fecha=${encodeURIComponent(fechaVal)}`);
    if (!res.ok) throw new Error("Error en la respuesta del servidor");
    
    datosReporteGlobal = await res.json();
    
    actualizarOpcionesAlumnosSegunAula();
    renderizarTablaReportes();
  } catch (err) {
    console.error("Error al cargar datos del reporte:", err);
    datosReporteGlobal = [];
    renderizarTablaReportes();
  }
}

function obtenerAlumnosPorAula() {
  const nivel = document.getElementById('filtroNivel')?.value || 'Todos';
  const grado = document.getElementById('filtroGrado')?.value || 'Todos';
  const seccion = document.getElementById('filtroSeccion')?.value || 'Todos';

  return datosReporteGlobal.filter(item => {
    const aulaStr = (item.aula || item.materia_aula || '').toUpperCase();

    if (nivel !== 'Todos' && !aulaStr.includes(nivel.toUpperCase())) return false;
    if (grado !== 'Todos' && !aulaStr.includes(grado.toUpperCase())) return false;

    if (seccion !== 'Todos') {
      const seccionNormalizada = seccion.toUpperCase();
      const partesAula = aulaStr.split(' ');
      const ultimaLetra = partesAula[partesAula.length - 1];

      if (ultimaLetra !== seccionNormalizada && !aulaStr.endsWith(` ${seccionNormalizada}`)) {
        return false;
      }
    }

    return true;
  });
}

function actualizarOpcionesAlumnosSegunAula() {
  const selectAlumno = document.getElementById('selectAlumnoIndividual');
  if (!selectAlumno) return;

  const valorSeleccionadoPrevio = selectAlumno.value;
  selectAlumno.innerHTML = '<option value="todos">-- Seleccionar Alumno --</option>';

  const alumnosDelAula = obtenerAlumnosPorAula();

  alumnosDelAula.forEach(alumno => {
    const option = document.createElement('option');
    option.value = alumno.codigo;
    option.textContent = `${alumno.nombre} (${alumno.codigo})`;
    selectAlumno.appendChild(option);
  });

  if (valorSeleccionadoPrevio && Array.from(selectAlumno.options).some(o => o.value === valorSeleccionadoPrevio)) {
    selectAlumno.value = valorSeleccionadoPrevio;
  } else {
    selectAlumno.value = 'todos';
  }
}

function configurarEventosFiltros() {
  const selectTipo = document.getElementById('filtroTipo');
  if (selectTipo) {
    selectTipo.addEventListener('change', actualizarTipoSelectorFecha);
  }

  ['filtroNivel', 'filtroGrado', 'filtroSeccion'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', () => {
        actualizarOpcionesAlumnosSegunAula();
        renderizarTablaReportes();
      });
    }
  });

  const selectAlumno = document.getElementById('selectAlumnoIndividual');
  if (selectAlumno) {
    selectAlumno.addEventListener('change', renderizarTablaReportes);
  }

  const busqueda = document.getElementById('filtroBusqueda');
  if (busqueda) {
    busqueda.addEventListener('input', renderizarTablaReportes);
  }

  document.getElementById('btnFichaAlumno')?.addEventListener('click', generarFichaAlumnoPDF);
  document.getElementById('btnReporteGrado')?.addEventListener('click', generarGradoPDF);
  document.getElementById('btnReporteDocentes')?.addEventListener('click', generarDocentesPDF);
}

// ----------------------------------------------------
// FILTRADO Y RENDERIZADO EN TABLA HTML
// ----------------------------------------------------

function obtenerAlumnosFiltradosBase() {
  const alumnoSeleccionado = document.getElementById('selectAlumnoIndividual')?.value || 'todos';
  const busqueda = (document.getElementById('filtroBusqueda')?.value || '').toLowerCase().trim();

  let resultado = obtenerAlumnosPorAula();

  if (alumnoSeleccionado !== 'todos') {
    resultado = resultado.filter(item => (item.codigo || '').toUpperCase() === alumnoSeleccionado.toUpperCase());
  }

  if (busqueda !== '') {
    resultado = resultado.filter(item => {
      const nom = (item.nombre || '').toLowerCase();
      const cod = (item.codigo || '').toLowerCase();
      return nom.includes(busqueda) || cod.includes(busqueda);
    });
  }

  return resultado;
}

function renderizarTablaReportes() {
  const tbody = document.getElementById('tbodyReportes');
  if (!tbody) return;

  const filtrados = obtenerAlumnosFiltradosBase();
  tbody.innerHTML = '';

  if (filtrados.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: #64748b; padding: 20px;">
          No se encontraron registros que coincidan con los filtros aplicados.
        </td>
      </tr>`;
    return;
  }

  const totalDiasPeriodo = obtenerTotalDiasPeriodo();

  filtrados.forEach(d => {
    const asist = d.asistencias || 0;
    const tard = d.tardanzas || 0;
    const faltasJust = d.fJustificadas || 0;
    const faltasInjust = d.fInjustificadas || 0;
    const totalFaltas = faltasJust + faltasInjust;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${d.codigo || '-'}</strong></td>
      <td>${d.nombre || '-'}</td>
      <td>${d.aula || d.materia_aula || 'Sin Asignación'}</td>
      <td style="text-align: center; color: #16a34a; font-weight: bold;">${asist} / ${totalDiasPeriodo}</td>
      <td style="text-align: center; color: #d97706; font-weight: bold;">${tard} / ${totalDiasPeriodo}</td>
      <td style="text-align: center; color: #dc2626; font-weight: bold;">${totalFaltas} / ${totalDiasPeriodo}</td>
      <td style="text-align: center; font-weight: bold; background-color: #f8fafc;">${d.puntajeTotal !== undefined ? d.puntajeTotal : 0} pts</td>
    `;
    tbody.appendChild(tr);
  });
}

// ----------------------------------------------------
// GENERACIÓN DE REPORTES EN PDF
// ----------------------------------------------------

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
  const pctPuntual = Math.round((metricas.puntuales / maxDias) * 100);
  const pctTardanza = Math.round((metricas.tardanzas / maxDias) * 100);
  const pctFaltas = Math.round((metricas.faltas / maxDias) * 100);

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
      fillColor: [241, 245, 249],
      textColor: [30, 41, 59],
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

  const headersHistorial = [["FECHA", "DIA", "HORA ENTRADA", "ESTADO", "OBSERVACIÓN"]];
  const rowsHistorial = historial.map(h => [
    h.fecha || '-',
    obtenerNombreDia(h.fecha),
    h.hora || '-',
    (h.estado || '-').toUpperCase(),
    obtenerObservacionEstado(h.estado)
  ]);

  if (rowsHistorial.length === 0) {
    rowsHistorial.push(["-", "-", "-", "SIN REGISTROS", "No existen registros de marcación en el periodo"]);
  }

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 14,
    head: headersHistorial,
    body: rowsHistorial,
    theme: 'striped',
    headStyles: {
      fillColor: [30, 41, 59],
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
      0: { halign: 'center', cellWidth: 28 },
      1: { halign: 'center', cellWidth: 24 },
      2: { halign: 'center', cellWidth: 28 },
      3: { halign: 'center', cellWidth: 28 },
      4: { cellWidth: 72 }
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

  await construirPDFModeloEstandar({
    titulo: "REPORTE CONSOLIDADO DE DOCENTES Y PERSONAL",
    codigo: "PERSONAL-DOCENTE",
    nombre: "Plana Docente I.E. Santa Rosa",
    aula: "Dirección Académica",
    periodo: `${tipo} (${fecha || 'General'})`,
    metricas: { puntuales: 0, tardanzas: 0, faltas: 0, puntaje: 0, totalPeriodo: obtenerTotalDiasPeriodo() },
    historial,
    nombreArchivo: `Reporte_Docentes_${fecha || 'General'}.pdf`
  });
}