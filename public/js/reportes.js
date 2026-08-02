let datosReporteGlobal = [];

const FERIADOS_PERU = [
  "2026-01-01", "2026-04-02", "2026-04-03", "2026-05-01",
  "2026-06-07", "2026-06-29", "2026-07-28", "2026-07-29",
  "2026-08-06", "2026-08-30", "2026-10-08", "2026-11-01",
  "2026-12-08", "2026-12-09", "2026-12-25"
];

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('filtroFecha').valueAsDate = new Date();
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

  if (tipo === 'Semanal') {
    // Para semanas tipo YYYY-Wxx
    return 5; 
  }

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
    const tipo = document.getElementById('filtroTipo').value;
    const fecha = document.getElementById('filtroFecha').value;

    const res = await fetch(`/api/asistencia/resumen?tipo=${tipo}&fecha=${fecha}`);
    datosReporteGlobal = await res.json();
    
    filtrarTablaLocal();
  } catch (error) {
    console.error('Error al cargar reportes:', error);
  }
}

function filtrarTablaLocal() {
  const tipo = document.getElementById('filtroTipo').value;
  const fecha = document.getElementById('filtroFecha').value;
  const maxDias = calcularDiasHabiles(tipo, fecha);

  const nivel = document.getElementById('filtroNivel').value;
  const grado = document.getElementById('filtroGrado').value;
  const seccion = document.getElementById('filtroSeccion').value;
  const nombreBusqueda = document.getElementById('filtroNombre').value.toLowerCase();

  const tbody = document.getElementById('tbodyReportes');
  tbody.innerHTML = '';

  const filtrados = datosReporteGlobal.filter(d => {
    const mat = d.materia_aula || '';
    const cumpleNivel = (nivel === 'Todos' || mat.includes(nivel));
    const cumpleGrado = (grado === 'Todos' || mat.includes(grado));
    const cumpleSeccion = (seccion === 'Todos' || mat.endsWith(seccion));
    const cumpleNombre = d.nombre.toLowerCase().includes(nombreBusqueda);

    return cumpleNivel && cumpleGrado && cumpleSeccion && cumpleNombre;
  });

  if (filtrados.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No se encontraron registros</td></tr>';
    return;
  }

  filtrados.forEach(d => {
    tbody.innerHTML += `
      <tr>
        <td><b>${d.codigo}</b></td>
        <td>${d.nombre}</td>
        <td>${d.materia_aula || '-'}</td>
        <td style="color: #16a34a; font-weight: bold;">${d.asistencias || 0}/${maxDias}</td>
        <td style="color: #ca8a04; font-weight: bold;">${d.tardanzas || 0}/${maxDias}</td>
        <td style="color: #2563eb; font-weight: bold;">${d.justificadas || 0}/${maxDias}</td>
        <td style="color: #dc2626; font-weight: bold;">${d.injustificadas || 0}/${maxDias}</td>
        <td><b style="color: #0284c7;">${d.puntos || 0} pts</b></td>
      </tr>
    `;
  });
}

function generarDocentesPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const tipo = document.getElementById('filtroTipo').value;
  const fecha = document.getElementById('filtroFecha').value;
  const maxDias = calcularDiasHabiles(tipo, fecha);

  doc.setFontSize(14);
  doc.text('I.E. SANTA ROSA - CAJAMARCA', 105, 12, { align: 'center' });
  doc.setFontSize(11);
  doc.text(`Reporte de Asistencia (${tipo}) - Docentes | Período: ${fecha}`, 105, 18, { align: 'center' });

  const docentes = datosReporteGlobal.filter(d => d.rol === 'Docente' || d.rol === 'Auxiliar');
  const bodyData = docentes.map(d => [
    d.codigo,
    d.nombre,
    d.materia_aula || '-',
    `${d.asistencias || 0}/${maxDias}`,
    `${d.tardanzas || 0}/${maxDias}`,
    `${d.justificadas || 0}/${maxDias}`,
    `${d.injustificadas || 0}/${maxDias}`,
    `${d.puntos || 0} pts`
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
  const tipo = document.getElementById('filtroTipo').value;
  const fecha = document.getElementById('filtroFecha').value;
  const maxDias = calcularDiasHabiles(tipo, fecha);

  doc.setFontSize(14);
  doc.text('I.E. SANTA ROSA - CAJAMARCA', 105, 12, { align: 'center' });
  doc.setFontSize(11);
  doc.text(`Reporte de Asistencia (${tipo}) - Alumnos por Grado | Período: ${fecha}`, 105, 18, { align: 'center' });

  const alumnos = datosReporteGlobal.filter(d => d.rol === 'Alumno');
  const bodyData = alumnos.map(a => [
    a.codigo,
    a.nombre,
    a.materia_aula || '-',
    `${a.asistencias || 0}/${maxDias}`,
    `${a.tardanzas || 0}/${maxDias}`,
    `${a.justificadas || 0}/${maxDias}`,
    `${a.injustificadas || 0}/${maxDias}`,
    `${a.puntos || 0} pts`
  ]);

  doc.autoTable({
    startY: 25,
    head: [['Código', 'Nombre', 'Grado / Sección', 'Asist.', 'Tard.', 'F. Just.', 'F. Inj.', 'Puntaje']],
    body: bodyData,
    theme: 'grid',
    headStyles: { fillColor: [2, 132, 199] }
  });

  doc.save(`Reporte_Alumnos_${tipo}.pdf`);
}