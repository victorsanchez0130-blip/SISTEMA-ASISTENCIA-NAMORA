let datosReporteGlobal = [];

const FERIADOS_PERU = [
  "2026-01-01", "2026-04-02", "2026-04-03", "2026-05-01",
  "2026-06-07", "2026-06-29", "2026-07-28", "2026-07-29",
  "2026-08-06", "2026-08-30", "2026-10-08", "2026-11-01",
  "2026-12-08", "2026-12-09", "2026-12-25"
];

document.addEventListener('DOMContentLoaded', () => {
  const inputFecha = document.getElementById('filtroFecha');
  if (inputFecha) inputFecha.valueAsDate = new Date();
  cargarReportes();
});

function cambiarTipoFiltroFecha() {
  const tipo = document.getElementById('filtroTipo').value;
  const contenedor = document.getElementById('contenedorFecha');

  if (tipo === 'Semanal') {
    contenedor.innerHTML = `<input type="week" id="filtroFecha" class="form-control" style="width: 210px;" onchange="cargarReportes()">`;
  } else if (tipo === 'Mensual') {
    contenedor.innerHTML = `<input type="month" id="filtroFecha" class="form-control" style="width: 180px;" onchange="cargarReportes()">`;
  } else {
    contenedor.innerHTML = `<input type="date" id="filtroFecha" class="form-control" style="width: 170px;" onchange="cargarReportes()">`;
    document.getElementById('filtroFecha').valueAsDate = new Date();
  }
  cargarReportes();
}

function calcularDiasHabiles(tipo, valorFecha) {
  if (!valorFecha) return 1;
  if (tipo === 'Diario') return 1;
  if (tipo === 'Semanal') return 5;

  if (tipo === 'Mensual') {
    const partes = valorFecha.split('-');
    const anio = parseInt(partes[0]);
    const mes = parseInt(partes[1]) - 1;
    const totalDiasMes = new Date(anio, mes + 1, 0).getDate();
    
    let diasHabiles = 0;
    for (let d = 1; d <= totalDiasMes; d++) {
      const fechaActual = new Date(anio, mes, d);
      const diaSemana = fechaActual.getDay();
      if (diaSemana >= 1 && diaSemana <= 5) {
        const strFecha = fechaActual.toISOString().split('T')[0];
        if (!FERIADOS_PERU.includes(strFecha)) {
          diasHabiles++;
        }
      }
    }
    return diasHabiles > 0 ? diasHabiles : 20;
  }

  return 1;
}

async function cargarReportes() {
  try {
    const res = await fetch('/api/reportes/consolidado');
    if (!res.ok) throw new Error('Error al obtener el consolidado');

    datosReporteGlobal = await res.json();
    actualizarFiltrosYTabla();
  } catch (error) {
    console.error('Error al cargar reportes:', error);
  }
}

function actualizarFiltrosYTabla() {
  poblarSelectAlumnos();
  filtrarTablaLocal();
}

function poblarSelectAlumnos() {
  const select = document.getElementById('selectAlumnoIndividual');
  if (!select) return;

  const valorPrevio = select.value;
  const alumnosAula = obtenerAlumnosPorAula();

  select.innerHTML = '<option value="todos">-- Todos los alumnos del aula --</option>';

  alumnosAula.forEach(a => {
    const option = document.createElement('option');
    option.value = a.codigo;
    option.textContent = `${a.codigo} | ${a.nombre}`;
    select.appendChild(option);
  });

  if ([...select.options].some(o => o.value === valorPrevio)) {
    select.value = valorPrevio;
  } else {
    select.value = 'todos';
  }
}

function obtenerAlumnosPorAula() {
  const nivel = (document.getElementById('filtroNivel')?.value || 'todos').toLowerCase();
  const grado = (document.getElementById('filtroGrado')?.value || 'todos').toLowerCase();
  const seccion = (document.getElementById('filtroSeccion')?.value || 'todos').toLowerCase();

  return datosReporteGlobal.filter(d => {
    const esAlumno = d.rol === 'Alumno' || !d.rol || d.rol === '';
    if (!esAlumno) return false;

    const mat = (d.aula || d.materia_aula || '').trim().toLowerCase();

    const cumpleNivel = (nivel === 'todos' || mat.includes(nivel));
    const cumpleGrado = (grado === 'todos' || mat.includes(grado));

    let cumpleSeccion = true;
    if (seccion !== 'todos') {
      cumpleSeccion = mat.endsWith(` ${seccion}`) || mat.endsWith(seccion);
    }

    return cumpleNivel && cumpleGrado && cumpleSeccion;
  });
}

function obtenerAlumnosFiltrados() {
  const alumnosAula = obtenerAlumnosPorAula();
  const nombreBusqueda = (document.getElementById('filtroNombre')?.value || '').trim().toLowerCase();
  const alumnoSeleccionado = document.getElementById('selectAlumnoIndividual')?.value || 'todos';

  return alumnosAula.filter(d => {
    const cumpleNombre = (d.nombre || '').toLowerCase().includes(nombreBusqueda);
    const cumpleIndividual = (alumnoSeleccionado === 'todos' || d.codigo === alumnoSeleccionado);

    return cumpleNombre && cumpleIndividual;
  });
}

function filtrarTablaLocal() {
  const tipo = document.getElementById('filtroTipo') ? document.getElementById('filtroTipo').value : 'Diario';
  const inputFecha = document.getElementById('filtroFecha');
  const fecha = inputFecha ? inputFecha.value : '';
  const maxDias = calcularDiasHabiles(tipo, fecha);

  const tbody = document.getElementById('tbodyReportes');
  if (!tbody) return;
  tbody.innerHTML = '';

  const filtrados = obtenerAlumnosFiltrados();

  if (filtrados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 20px; color: #64748b;">No se encontraron registros</td></tr>';
    return;
  }

  filtrados.forEach(d => {
    const aulaTexto = d.aula || d.materia_aula || 'Sin Asignación';
    const puntajeMostrar = d.puntajeTotal !== undefined ? d.puntajeTotal : (d.puntos || 0);
    const totalFaltas = d.faltas !== undefined ? d.faltas : 0;

    tbody.innerHTML += `
      <tr>
        <td><b>${d.codigo}</b></td>
        <td>${d.nombre}</td>
        <td>${aulaTexto}</td>
        <td style="color: #16a34a; font-weight: bold;">${d.asistencias || 0}/${maxDias}</td>
        <td style="color: #ca8a04; font-weight: bold;">${d.tardanzas || 0}/${maxDias}</td>
        <td style="color: #dc2626; font-weight: bold;">${totalFaltas}/${maxDias}</td>
        <td><b style="color: #0284c7;">${puntajeMostrar} pts</b></td>
      </tr>
    `;
  });
}

// Dibujar membrete oficial
function agregarMembreteInstitucional(doc, titulo) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(14, 42, 71);
  doc.text("I.E. SANTA ROSA - NAMORA", 105, 15, { align: "center" });

  doc.setFontSize(12);
  doc.setTextColor(71, 85, 105);
  doc.text(titulo, 105, 22, { align: "center" });

  doc.setLineWidth(0.5);
  doc.setDrawColor(226, 232, 240);
  doc.line(14, 26, 196, 26);
}

// Generar Ficha Individual REAL (Sincronizada)
async function generarFichaAlumnoPDF() {
  const codSel = document.getElementById('selectAlumnoIndividual')?.value;
  if (!codSel || codSel === 'todos') {
    alert("Por favor, seleccione un alumno específico en el menú desplegable 'Filtrar Alumno'.");
    return;
  }

  const alumno = datosReporteGlobal.find(a => a.codigo === codSel);
  if (!alumno) {
    alert("No se encontraron datos para el alumno seleccionado.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const fechaFiltro = document.getElementById('filtroFecha')?.value || '';

  agregarMembreteInstitucional(doc, "FICHA INDIVIDUAL DE ASISTENCIA Y PUNTUALIDAD");

  // Encabezado con Datos Reales del Alumno
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);

  doc.text("CÓDIGO ALUMNO:", 14, 34);
  doc.setFont("helvetica", "normal");
  doc.text(alumno.codigo, 60, 34);

  doc.setFont("helvetica", "bold");
  doc.text("APELLIDOS Y NOMBRES:", 14, 40);
  doc.setFont("helvetica", "normal");
  doc.text(alumno.nombre, 60, 40);

  doc.setFont("helvetica", "bold");
  doc.text("AULA / SECCIÓN:", 14, 46);
  doc.setFont("helvetica", "normal");
  doc.text(alumno.aula || alumno.materia_aula || '-', 60, 46);

  doc.setFont("helvetica", "bold");
  doc.text("PERÍODO EVALUADO:", 14, 52);
  doc.setFont("helvetica", "normal");
  doc.text(fechaFiltro || "General", 60, 52);

  // Cuadro Resumen de Metricas
  const resumenData = [[
    `${alumno.asistencias || 0}`,
    `${alumno.tardanzas || 0}`,
    `${alumno.faltas || 0}`,
    `${alumno.puntajeTotal !== undefined ? alumno.puntajeTotal : (alumno.puntos || 0)} pts`
  ]];

  doc.autoTable({
    startY: 58,
    head: [['PUNTUALES', 'TARDANZAS', 'FALTAS', 'PUNTAJE']],
    body: resumenData,
    theme: 'grid',
    headStyles: { fillColor: [0, 102, 51], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
    styles: { halign: 'center', fontSize: 10, fontStyle: 'bold' }
  });

  // Consultar la API para traer marcaciones REALES
  let historialFiltrado = [];
  try {
    const res = await fetch(`/api/asistencias/alumno/${alumno.codigo}`);
    if (res.ok) {
      const dataAsistencias = await res.json();
      
      // Filtrar por fecha seleccionada si aplica
      if (fechaFiltro) {
        historialFiltrado = dataAsistencias.filter(reg => reg.fecha === fechaFiltro || reg.fecha_hora?.startsWith(fechaFiltro));
      } else {
        historialFiltrado = dataAsistencias;
      }
    }
  } catch (err) {
    console.warn("No se pudo obtener el historial detallado del servidor:", err);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("HISTORIAL DETALLADO DÍA A DÍA", 14, doc.lastAutoTable.finalY + 12);

  let bodyHistorial = [];

  if (historialFiltrado.length > 0) {
    bodyHistorial = historialFiltrado.map(reg => {
      const fechaReg = reg.fecha || reg.fecha_hora?.split(' ')[0] || fechaFiltro;
      const horaReg = reg.hora || (reg.fecha_hora?.split(' ')[1]) || '-';
      const estadoReg = (reg.estado || 'REGISTRADO').toUpperCase();
      const obsReg = reg.observacion || (estadoReg === 'TARDE' ? 'Ingreso fuera de horario regular' : 'Ingreso registrado en escáner');

      const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
      let nombreDia = 'Registrado';
      if (fechaReg) {
        const d = new Date(fechaReg + 'T00:00:00');
        if (!isNaN(d.getTime())) nombreDia = diasSemana[d.getDay()];
      }

      return [fechaReg, nombreDia, horaReg, estadoReg, obsReg];
    });
  } else {
    // Si NO tiene registros reales, NO se llena información falsa
    bodyHistorial = [
      ['-', '-', '-', '-', 'Sin registros de asistencia en el período seleccionado']
    ];
  }

  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 16,
    head: [['FECHA', 'DÍA', 'HORA ENTRADA', 'ESTADO', 'OBSERVACIÓN']],
    body: bodyHistorial,
    theme: 'grid',
    headStyles: { fillColor: [71, 85, 105], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 8 }
  });

  // Firmas al Pie
  const posY = doc.lastAutoTable.finalY + 30;
  doc.setLineWidth(0.5);
  doc.setDrawColor(100);

  doc.line(30, posY, 85, posY);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("Auxiliar / Auxiliar de Disciplina", 57.5, posY + 5, { align: "center" });

  doc.line(125, posY, 180, posY);
  doc.text("Dirección / Dirección Académica", 152.5, posY + 5, { align: "center" });

  doc.save(`Ficha_Asistencia_${alumno.codigo}.pdf`);
}

function generarDocentesPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const tipo = document.getElementById('filtroTipo')?.value || 'Diario';
  const fecha = document.getElementById('filtroFecha')?.value || '';
  const maxDias = calcularDiasHabiles(tipo, fecha);

  agregarMembreteInstitucional(doc, `REPORTE DE ASISTENCIA (${tipo.toUpperCase()}) - DOCENTES`);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Fecha/Período: ${fecha}`, 14, 32);

  const docentes = datosReporteGlobal.filter(d => d.rol === 'Docente' || d.rol === 'Auxiliar');
  const bodyData = docentes.map(d => [
    d.codigo,
    d.nombre,
    d.materia_aula || d.aula || '-',
    `${d.asistencias || 0}/${maxDias}`,
    `${d.tardanzas || 0}/${maxDias}`,
    `${d.faltas || 0}/${maxDias}`,
    `${d.puntajeTotal !== undefined ? d.puntajeTotal : (d.puntos || 0)} pts`
  ]);

  doc.autoTable({
    startY: 36,
    head: [['Código', 'Nombre', 'Materia / Asignación', 'Asist.', 'Tard.', 'Faltas', 'Puntaje']],
    body: bodyData,
    theme: 'grid',
    headStyles: { fillColor: [14, 42, 71], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 8 }
  });

  doc.save(`Reporte_Docentes_${tipo}.pdf`);
}

function generarGradoPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const tipo = document.getElementById('filtroTipo')?.value || 'Diario';
  const fecha = document.getElementById('filtroFecha')?.value || '';
  const maxDias = calcularDiasHabiles(tipo, fecha);

  const valNivel = document.getElementById('filtroNivel')?.value || 'TODOS';
  const valGrado = document.getElementById('filtroGrado')?.value || 'TODOS';
  const valSeccion = document.getElementById('filtroSeccion')?.value || 'TODOS';

  const alumnos = obtenerAlumnosFiltrados();

  if (alumnos.length === 0) {
    alert("No hay alumnos para exportar con los filtros seleccionados.");
    return;
  }

  agregarMembreteInstitucional(doc, `REPORTE CONSOLIDADO POR GRADO (${tipo.toUpperCase()})`);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Nivel: ${valNivel} | Grado: ${valGrado} | Sección: ${valSeccion} | Período: ${fecha}`, 14, 32);

  const bodyData = alumnos.map(a => [
    a.codigo,
    a.nombre,
    a.aula || a.materia_aula || '-',
    `${a.asistencias || 0}/${maxDias}`,
    `${a.tardanzas || 0}/${maxDias}`,
    `${a.faltas || 0}/${maxDias}`,
    `${a.puntajeTotal !== undefined ? a.puntajeTotal : (a.puntos || 0)} pts`
  ]);

  doc.autoTable({
    startY: 36,
    head: [['Código', 'Nombre', 'Grado / Sección', 'Asist.', 'Tard.', 'Faltas', 'Puntaje']],
    body: bodyData,
    theme: 'grid',
    headStyles: { fillColor: [2, 132, 199], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { fontSize: 8 }
  });

  const nombreArchivo = `Reporte_Alumnos_${valNivel}_${valGrado}_${valSeccion}.pdf`.replace(/\s+/g, '_');
  doc.save(nombreArchivo);
}
