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

// Función auxiliar para formatear YYYY-MM-DD localmente (evita desfase UTC de toISOString)
function formatearFechaLocal(fecha) {
  const a = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

// Obtener el Lunes de la semana ISO (ej. "2026-W31")
function obtenerLunesDeSemanaISO(valorWeek) {
  const partes = valorWeek.split('-W');
  if (partes.length !== 2) return null;
  const anio = parseInt(partes[0], 10);
  const semana = parseInt(partes[1], 10);

  // El 4 de enero siempre está en la semana 1 según ISO-8601
  const simple = new Date(anio, 0, 4);
  const day = simple.getDay() || 7; // Si es domingo (0), tratar como 7
  simple.setDate(simple.getDate() - day + 1); // Lunes de la semana 1
  simple.setDate(simple.getDate() + (semana - 1) * 7); // Lunes de la semana objetivo

  return simple;
}

function calcularDiasHabiles(tipo, valorFecha) {
  if (!valorFecha) return 1;

  // 1. REPORTES DIARIOS
  if (tipo === 'Diario') {
    const partes = valorFecha.split('-');
    if (partes.length === 3) {
      const fechaActual = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
      const diaSemana = fechaActual.getDay();
      const strFecha = formatearFechaLocal(fechaActual);

      // Si es Sábado (6), Domingo (0) o Feriado, el total de días hábiles es 0
      if (diaSemana === 0 || diaSemana === 6 || FERIADOS_PERU.includes(strFecha)) {
        return 0;
      }
    }
    return 1;
  }

  // 2. REPORTES SEMANALES
  if (tipo === 'Semanal') {
    const fechaLunes = obtenerLunesDeSemanaISO(valorFecha);
    if (!fechaLunes) return 5;

    let diasHabiles = 0;
    for (let i = 0; i < 5; i++) { // Iterar de Lunes (0) a Viernes (4)
      const fechaDia = new Date(fechaLunes);
      fechaDia.setDate(fechaLunes.getDate() + i);

      const strFecha = formatearFechaLocal(fechaDia);
      if (!FERIADOS_PERU.includes(strFecha)) {
        diasHabiles++;
      }
    }
    return diasHabiles;
  }

  // 3. REPORTES MENSUALES
  if (tipo === 'Mensual') {
    const partes = valorFecha.split('-');
    if (partes.length < 2) return 20;

    const anio = parseInt(partes[0], 10);
    const mes = parseInt(partes[1], 10) - 1;
    const totalDiasMes = new Date(anio, mes + 1, 0).getDate();
    
    let diasHabiles = 0;
    for (let d = 1; d <= totalDiasMes; d++) {
      const fechaActual = new Date(anio, mes, d);
      const diaSemana = fechaActual.getDay();

      if (diaSemana >= 1 && diaSemana <= 5) { // Lunes a Viernes
        const strFecha = formatearFechaLocal(fechaActual);
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
    console.log("Datos consolidados cargados correctamente:", datosReporteGlobal);
    
    filtrarTablaLocal();
  } catch (error) {
    console.error('Error al cargar reportes:', error);
  }
}

// Función auxiliar para obtener la lista filtrada de alumnos según los desplegables de la UI
function obtenerAlumnosFiltrados() {
  const nivel = (document.getElementById('filtroNivel')?.value || 'todos').toLowerCase();
  const grado = (document.getElementById('filtroGrado')?.value || 'todos').toLowerCase();
  const seccion = (document.getElementById('filtroSeccion')?.value || 'todos').toLowerCase();
  const nombreBusqueda = (document.getElementById('filtroNombre')?.value || '').trim().toLowerCase();

  return datosReporteGlobal.filter(d => {
    // Solo alumnos (o registros sin rol definido explícitamente como docente/auxiliar)
    const esAlumno = d.rol === 'Alumno' || !d.rol || d.rol === '';
    if (!esAlumno) return false;

    const mat = (d.aula || d.materia_aula || '').trim().toLowerCase();

    // 1. Validar Nivel
    const cumpleNivel = (nivel === 'todos' || mat.includes(nivel));

    // 2. Validar Grado
    const cumpleGrado = (grado === 'todos' || mat.includes(grado));

    // 3. Validar Sección
    let cumpleSeccion = true;
    if (seccion !== 'todos') {
      cumpleSeccion = mat.endsWith(` ${seccion}`) || mat.endsWith(seccion);
    }

    // 4. Validar Nombre
    const cumpleNombre = (d.nombre || '').toLowerCase().includes(nombreBusqueda);

    return cumpleNivel && cumpleGrado && cumpleSeccion && cumpleNombre;
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
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 20px; color: #64748b;">No se encontraron registros</td></tr>';
    return;
  }

  filtrados.forEach(d => {
    const aulaTexto = d.aula || d.materia_aula || 'Sin Asignación';
    const puntajeMostrar = d.puntajeTotal !== undefined ? d.puntajeTotal : (d.puntos || 0);

    tbody.innerHTML += `
      <tr>
        <td><b>${d.codigo}</b></td>
        <td>${d.nombre}</td>
        <td>${aulaTexto}</td>
        <td style="color: #16a34a; font-weight: bold;">${d.asistencias || 0}/${maxDias}</td>
        <td style="color: #ca8a04; font-weight: bold;">${d.tardanzas || 0}/${maxDias}</td>
        <td style="color: #2563eb; font-weight: bold;">${d.fJustificadas || d.justificadas || 0}/${maxDias}</td>
        <td style="color: #dc2626; font-weight: bold;">${d.fInjustificadas || d.injustificadas || 0}/${maxDias}</td>
        <td><b style="color: #0284c7;">${puntajeMostrar} pts</b></td>
      </tr>
    `;
  });
}

function generarDocentesPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const tipo = document.getElementById('filtroTipo') ? document.getElementById('filtroTipo').value : 'Diario';
  const fecha = document.getElementById('filtroFecha') ? document.getElementById('filtroFecha').value : '';
  const maxDias = calcularDiasHabiles(tipo, fecha);

  doc.setFontSize(14);
  doc.text('I.E. SANTA ROSA - CAJAMARCA', 105, 12, { align: 'center' });
  doc.setFontSize(11);
  doc.text(`Reporte de Asistencia (${tipo}) - Docentes | Período: ${fecha}`, 105, 18, { align: 'center' });

  const docentes = datosReporteGlobal.filter(d => d.rol === 'Docente' || d.rol === 'Auxiliar');
  const bodyData = docentes.map(d => [
    d.codigo,
    d.nombre,
    d.materia_aula || d.aula || '-',
    `${d.asistencias || 0}/${maxDias}`,
    `${d.tardanzas || 0}/${maxDias}`,
    `${d.fJustificadas || d.justificadas || 0}/${maxDias}`,
    `${d.fInjustificadas || d.injustificadas || 0}/${maxDias}`,
    `${d.puntajeTotal !== undefined ? d.puntajeTotal : (d.puntos || 0)} pts`
  ]);

  doc.autoTable({
    startY: 25,
    head: [['Código', 'Nombre', 'Materia / Asignación', 'Asist.', 'Tard.', 'F. Just.', 'F. Inj.', 'Puntaje']],
    body: bodyData,
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42] }
  });

  doc.save(`Reporte_Docentes_${tipo}.pdf`);
}

function generarGradoPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const tipo = document.getElementById('filtroTipo') ? document.getElementById('filtroTipo').value : 'Diario';
  const fecha = document.getElementById('filtroFecha') ? document.getElementById('filtroFecha').value : '';
  const maxDias = calcularDiasHabiles(tipo, fecha);

  const valNivel = document.getElementById('filtroNivel')?.value || 'TODOS';
  const valGrado = document.getElementById('filtroGrado')?.value || 'TODOS';
  const valSeccion = document.getElementById('filtroSeccion')?.value || 'TODOS';

  const alumnos = obtenerAlumnosFiltrados();

  if (alumnos.length === 0) {
    alert("No hay alumnos para exportar con los filtros seleccionados.");
    return;
  }

  doc.setFontSize(14);
  doc.text('I.E. SANTA ROSA - CAJAMARCA', 105, 12, { align: 'center' });
  doc.setFontSize(11);
  
  const textoFiltro = `Filtro: [Nivel: ${valNivel} | Grado: ${valGrado} | Sección: ${valSeccion}]`;
  doc.text(`Reporte de Asistencia (${tipo}) - Alumnos | Período: ${fecha}`, 105, 18, { align: 'center' });
  doc.setFontSize(9);
  doc.text(textoFiltro, 105, 23, { align: 'center' });

  const bodyData = alumnos.map(a => [
    a.codigo,
    a.nombre,
    a.aula || a.materia_aula || '-',
    `${a.asistencias || 0}/${maxDias}`,
    `${a.tardanzas || 0}/${maxDias}`,
    `${a.fJustificadas || a.justificadas || 0}/${maxDias}`,
    `${a.fInjustificadas || a.injustificadas || 0}/${maxDias}`,
    `${a.puntajeTotal !== undefined ? d.puntajeTotal : (a.puntos || 0)} pts`
  ]);

  doc.autoTable({
    startY: 27,
    head: [['Código', 'Nombre', 'Grado / Sección', 'Asist.', 'Tard.', 'F. Just.', 'F. Inj.', 'Puntaje']],
    body: bodyData,
    theme: 'grid',
    headStyles: { fillColor: [2, 132, 199] }
  });

  const nombreArchivo = `Reporte_Alumnos_${valNivel}_${valGrado}_${valSeccion}.pdf`.replace(/\s+/g, '_');
  doc.save(nombreArchivo);
}