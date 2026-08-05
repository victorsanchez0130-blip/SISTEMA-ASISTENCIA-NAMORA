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

function formatearFechaLocal(fecha) {
  const a = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

// Lunes exacto para semanas tipo "2026-W31"
function obtenerLunesDeSemanaISO(valorWeek) {
  if (!valorWeek || !valorWeek.includes('-W')) return null;
  const partes = valorWeek.split('-W');
  const anio = parseInt(partes[0], 10);
  const semana = parseInt(partes[1], 10);

  // Determinar primer lunes del año ISO
  const simple = new Date(anio, 0, 4);
  const day = simple.getDay() || 7;
  simple.setDate(simple.getDate() - day + 1);
  simple.setDate(simple.getDate() + (semana - 1) * 7);

  return simple;
}

function calcularDiasHabiles(tipo, valorFecha) {
  if (!valorFecha) return 1;

  if (tipo === 'Diario') {
    const partes = valorFecha.split('-');
    if (partes.length === 3) {
      const fechaActual = new Date(parseInt(partes[0], 10), parseInt(partes[1], 10) - 1, parseInt(partes[2], 10));
      const diaSemana = fechaActual.getDay();
      const strFecha = formatearFechaLocal(fechaActual);

      if (diaSemana === 0 || diaSemana === 6 || FERIADOS_PERU.includes(strFecha)) {
        return 0;
      }
    }
    return 1;
  }

  if (tipo === 'Semanal') {
    const fechaLunes = obtenerLunesDeSemanaISO(valorFecha);
    if (!fechaLunes) return 5;

    let diasHabiles = 0;
    for (let i = 0; i < 5; i++) {
      const fechaDia = new Date(fechaLunes);
      fechaDia.setDate(fechaLunes.getDate() + i);
      const strFecha = formatearFechaLocal(fechaDia);

      if (!FERIADOS_PERU.includes(strFecha)) {
        diasHabiles++;
      }
    }
    return diasHabiles;
  }

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

      if (diaSemana >= 1 && diaSemana <= 5) {
        const strFecha = formatearFechaLocal(fechaActual);
        if (!FERIADOS_PERU.includes(strFecha)) {
          diasHabiles++;
        }
      }
    }
    return diasHabiles;
  }

  return 1;
}

async function cargarReportes() {
  try {
    const tipo = document.getElementById('filtroTipo')?.value || 'Diario';
    const fecha = document.getElementById('filtroFecha')?.value || '';

    // Enviar los filtros al endpoint para que el backend filtre los conteos
    const url = `/api/reportes/consolidado?tipo=${tipo}&fecha=${fecha}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Error al obtener el consolidado');

    datosReporteGlobal = await res.json();
    filtrarTablaLocal();
  } catch (error) {
    console.error('Error al cargar reportes:', error);
  }
}

function obtenerAlumnosFiltrados() {
  const nivel = (document.getElementById('filtroNivel')?.value || 'todos').toLowerCase();
  const grado = (document.getElementById('filtroGrado')?.value || 'todos').toLowerCase();
  const seccion = (document.getElementById('filtroSeccion')?.value || 'todos').toLowerCase();
  const nombreBusqueda = (document.getElementById('filtroNombre')?.value || '').trim().toLowerCase();

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