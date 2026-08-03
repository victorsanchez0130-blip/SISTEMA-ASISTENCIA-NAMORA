let listaDocentes = [];
let listaAlumnos = [];

document.addEventListener('DOMContentLoaded', cargarRankings);

async function cargarRankings() {
  try {
    // 1. Obtener la lista general de usuarios
    let resUsuarios = await fetch('/api/usuarios');
    if (!resUsuarios.ok) resUsuarios = await fetch('/api/estudiantes');
    const usuarios = resUsuarios.ok ? await resUsuarios.json() : [];

    // 2. Obtener el historial de marcaciones/asistencias para calcular los puntos
    let resReportes = await fetch('/api/reportes/consolidado');
    if (!resReportes.ok) resReportes = await fetch('/api/asistencias');
    const reportes = resReportes.ok ? await resReportes.json() : [];

    // Mapa para acumular puntos por código/id de usuario
    const mapaPuntos = {};

    // 3. Procesar las asistencias según el sistema de reglas de puntuación
    reportes.forEach(rep => {
      const cod = rep.codigo || rep.estudiante_id || rep.usuario_id || rep.id;
      if (!cod) return;

      if (!mapaPuntos[cod]) mapaPuntos[cod] = 0;

      // Evaluar estado del registro (Puntual = 2 | Tarde = 1 | Justificada = 0.5 | Injustificada = 0)
      const estado = (rep.estado || '').toUpperCase();
      
      if (estado === 'PUNTUAL' || estado === 'PRESENTE' || rep.puntual === 1) {
        mapaPuntos[cod] += 2;
      } else if (estado === 'TARDE' || (rep.tardanzas && rep.tardanzas > 0)) {
        mapaPuntos[cod] += 1;
      } else if (estado === 'JUSTIFICADO' || estado === 'FALTA JUSTIFICADA' || estado === 'FJ') {
        mapaPuntos[cod] += 0.5;
      } else if (estado === 'FALTA' || estado === 'INJUSTIFICADO' || estado === 'FI') {
        mapaPuntos[cod] += 0;
      } else {
        // En caso de que el objeto ya traiga una propiedad de puntos asignada desde la DB
        mapaPuntos[cod] += (rep.puntos || 0);
      }
    });

    // 4. Asignar los puntos calculados y clasificar en Docentes y Alumnos
    const docentesTemp = [];
    const alumnosTemp = [];

    usuarios.forEach(u => {
      const cod = u.codigo || u.id;
      
      // Si el usuario ya viene con un campo puntos estático en DB o usa el acumulador dinámico
      const puntosTotales = (typeof u.puntos === 'number' && u.puntos > 0) 
        ? u.puntos 
        : (mapaPuntos[cod] || 0);

      const usuarioFormateado = {
        ...u,
        puntos: puntosTotales
      };

      const rol = (u.rol || u.tipo || '').toLowerCase();
      if (rol === 'docente' || rol === 'auxiliar') {
        docentesTemp.push(usuarioFormateado);
      } else {
        alumnosTemp.push(usuarioFormateado);
      }
    });

    // 5. Ordenar de mayor a menor puntaje
    listaDocentes = docentesTemp.sort((a, b) => (b.puntos || 0) - (a.puntos || 0));
    listaAlumnos = alumnosTemp.sort((a, b) => (b.puntos || 0) - (a.puntos || 0));

    // 6. Renderizar Tabla Docentes
    const tbodyDocentes = document.getElementById('tbodyRankingDocentes');
    if (tbodyDocentes) {
      tbodyDocentes.innerHTML = '';
      if (listaDocentes.length === 0) {
        tbodyDocentes.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay docentes registrados</td></tr>';
      } else {
        listaDocentes.forEach((d, index) => {
          tbodyDocentes.innerHTML += `
            <tr>
              <td><b>#${index + 1}</b></td>
              <td>${d.nombre || d.nombre_completo}</td>
              <td>${d.materia_aula || d.aula || d.grado || '-'}</td>
              <td><b style="color:#0284c7;">${d.puntos || 0} pts</b></td>
            </tr>
          `;
        });
      }
    }

    // 7. Renderizar Tabla Alumnos
    const tbodyAlumnos = document.getElementById('tbodyRankingAlumnos');
    if (tbodyAlumnos) {
      tbodyAlumnos.innerHTML = '';
      if (listaAlumnos.length === 0) {
        tbodyAlumnos.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay alumnos registrados</td></tr>';
      } else {
        listaAlumnos.forEach((a, index) => {
          tbodyAlumnos.innerHTML += `
            <tr>
              <td><b>#${index + 1}</b></td>
              <td>${a.nombre || a.nombre_completo}</td>
              <td>${a.materia_aula || a.aula || a.grado || '-'}</td>
              <td><b style="color:#0284c7;">${a.puntos || 0} pts</b></td>
            </tr>
          `;
        });
      }
    }

  } catch (error) {
    console.error('Error al cargar los rankings:', error);
  }
}

function imprimirRankingDocentesPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text('I.E. SANTA ROSA - NAMORA', 105, 15, { align: 'center' });
  doc.setFontSize(12);
  doc.text('Ranking Oficial de Méritos - Docentes', 105, 22, { align: 'center' });

  const bodyData = listaDocentes.map((d, index) => [
    `#${index + 1}`,
    d.nombre || d.nombre_completo,
    d.materia_aula || d.aula || '-',
    `${d.puntos || 0} pts`
  ]);

  doc.autoTable({
    startY: 30,
    head: [['Posición', 'Nombre Completo', 'Materia / Área', 'Puntaje']],
    body: bodyData,
    theme: 'striped',
    headStyles: { fillColor: [2, 132, 199] }
  });

  doc.save('Ranking_Docentes_Santa_Rosa.pdf');
}

function imprimirRankingAlumnosPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.text('I.E. SANTA ROSA - NAMORA', 105, 15, { align: 'center' });
  doc.setFontSize(12);
  doc.text('Ranking Oficial de Méritos - Alumnos', 105, 22, { align: 'center' });

  const bodyData = listaAlumnos.map((a, index) => [
    `#${index + 1}`,
    a.nombre || a.nombre_completo,
    a.materia_aula || a.aula || '-',
    `${a.puntos || 0} pts`
  ]);

  doc.autoTable({
    startY: 30,
    head: [['Posición', 'Nombre Completo', 'Aula / Grado', 'Puntaje']],
    body: bodyData,
    theme: 'striped',
    headStyles: { fillColor: [16, 185, 129] }
  });

  doc.save('Ranking_Alumnos_Santa_Rosa.pdf');
}