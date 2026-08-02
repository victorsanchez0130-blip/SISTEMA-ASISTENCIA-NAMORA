let listaDocentes = [];
let listaAlumnos = [];

document.addEventListener('DOMContentLoaded', cargarRankings);

async function cargarRankings() {
  try {
    const res = await fetch('/api/usuarios');
    const usuarios = await res.json();

    listaDocentes = usuarios
      .filter(u => u.rol === 'Docente')
      .sort((a, b) => (b.puntos || 0) - (a.puntos || 0));

    listaAlumnos = usuarios
      .filter(u => u.rol === 'Alumno')
      .sort((a, b) => (b.puntos || 0) - (a.puntos || 0));

    // Renderizar Tabla Docentes
    const tbodyDocentes = document.getElementById('tbodyRankingDocentes');
    tbodyDocentes.innerHTML = '';
    if (listaDocentes.length === 0) {
      tbodyDocentes.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay docentes registrados</td></tr>';
    } else {
      listaDocentes.forEach((d, index) => {
        tbodyDocentes.innerHTML += `
          <tr>
            <td><b>#${index + 1}</b></td>
            <td>${d.nombre}</td>
            <td>${d.materia_aula || '-'}</td>
            <td><b style="color:#0284c7;">${d.puntos || 0} pts</b></td>
          </tr>
        `;
      });
    }

    // Renderizar Tabla Alumnos
    const tbodyAlumnos = document.getElementById('tbodyRankingAlumnos');
    tbodyAlumnos.innerHTML = '';
    if (listaAlumnos.length === 0) {
      tbodyAlumnos.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay alumnos registrados</td></tr>';
    } else {
      listaAlumnos.forEach((a, index) => {
        tbodyAlumnos.innerHTML += `
          <tr>
            <td><b>#${index + 1}</b></td>
            <td>${a.nombre}</td>
            <td>${a.materia_aula || '-'}</td>
            <td><b style="color:#0284c7;">${a.puntos || 0} pts</b></td>
          </tr>
        `;
      });
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
    d.nombre,
    d.materia_aula || '-',
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
    a.nombre,
    a.materia_aula || '-',
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