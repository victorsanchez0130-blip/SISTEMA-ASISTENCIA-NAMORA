let listaDocentes = [];
let listaAlumnos = [];

document.addEventListener('DOMContentLoaded', cargarRankings);

async function cargarRankings() {
  try {
    // 1. Consumir el endpoint backend unificado de rankings
    const res = await fetch('/api/rankings');
    
    if (!res.ok) {
      console.error('Error al obtener datos del servidor');
      return;
    }

    const data = await res.json();
    if (!data.success) return;

    const docentes = data.docentes || [];
    const alumnos = data.alumnos || [];

    // 2. Renderizar Tabla Docentes
    const tbodyDocentes = document.getElementById('tbodyRankingDocentes');
    if (tbodyDocentes) {
      tbodyDocentes.innerHTML = '';
      if (docentes.length === 0) {
        tbodyDocentes.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400 font-medium">No hay docentes registrados</td></tr>';
      } else {
        docentes.forEach((d, index) => {
          tbodyDocentes.innerHTML += `
            <tr class="border-b border-slate-100 text-xs hover:bg-slate-50">
              <td class="p-3 font-bold text-slate-700">#${index + 1}</td>
              <td class="p-3 font-medium text-slate-800">${d.nombre}</td>
              <td class="p-3 text-slate-600">${d.asignacion || '-'}</td>
              <td class="p-3 font-bold text-sky-600">${d.puntaje_acumulado || 0} pts</td>
            </tr>
          `;
        });
      }
    }

    // 3. Renderizar Tabla Alumnos
    const tbodyAlumnos = document.getElementById('tbodyRankingAlumnos');
    if (tbodyAlumnos) {
      tbodyAlumnos.innerHTML = '';
      if (alumnos.length === 0) {
        tbodyAlumnos.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400 font-medium">No hay alumnos registrados</td></tr>';
      } else {
        alumnos.forEach((a, index) => {
          tbodyAlumnos.innerHTML += `
            <tr class="border-b border-slate-100 text-xs hover:bg-slate-50">
              <td class="p-3 font-bold text-slate-700">#${index + 1}</td>
              <td class="p-3 font-medium text-slate-800">${a.nombre}</td>
              <td class="p-3 text-slate-600">${a.asignacion || '-'}</td>
              <td class="p-3 font-bold text-sky-600">${a.puntaje_acumulado || 0} pts</td>
            </tr>
          `;
        });
      }
    }

  } catch (error) {
    console.error('Error al cargar los rankings:', error);
  }
}

// Ejecutar al cargar la página
document.addEventListener('DOMContentLoaded', cargarRankings);

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