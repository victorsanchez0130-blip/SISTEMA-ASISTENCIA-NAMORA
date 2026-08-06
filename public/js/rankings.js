let listaDocentes = [];
let listaAlumnos = [];

document.addEventListener('DOMContentLoaded', cargarRankings);

async function cargarRankings() {
  try {
    const res = await fetch('/api/rankings');
    if (!res.ok) return;

    const data = await res.json();
    if (!data.success) return;

    listaDocentes = data.docentes || [];
    listaAlumnos = data.alumnos || [];

    // Renderizar Tabla Docentes
    const tbodyDocentes = document.getElementById('tbodyRankingDocentes');
    if (tbodyDocentes) {
      tbodyDocentes.innerHTML = '';
      if (listaDocentes.length === 0) {
        tbodyDocentes.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400 font-medium">No hay docentes registrados</td></tr>';
      } else {
        listaDocentes.forEach((d, index) => {
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

    // Renderizar Tabla Alumnos
    const tbodyAlumnos = document.getElementById('tbodyRankingAlumnos');
    if (tbodyAlumnos) {
      tbodyAlumnos.innerHTML = '';
      if (listaAlumnos.length === 0) {
        tbodyAlumnos.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400 font-medium">No hay alumnos registrados</td></tr>';
      } else {
        listaAlumnos.forEach((a, index) => {
          tbodyAlumnos.innerHTML += `
            <tr class="border-b border-slate-100 text-xs hover:bg-slate-50">
              <td class="p-3 font-bold text-slate-700">#${index + 1}</td>
              <td class="p-3 font-medium text-slate-800">${a.nombre}</td>
              <td class="p-3 text-slate-600">${a.asignacion || '-'}</td>
              <td class="p-3 font-bold text-emerald-600">${a.puntaje_acumulado || 0} pts</td>
            </tr>
          `;
        });
      }
    }

  } catch (error) {
    console.error('Error al cargar los rankings:', error);
  }
}

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

// Función compartida interna para precargar imagen en Rankings
function preCargarLogoRankings(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = url;
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // Retorna nulo pacíficamente si falla
  });
}

async function imprimirRankingDocentesPDF() {
  if (listaDocentes.length === 0) {
    alert("No hay datos cargados para generar el ranking.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Precargar Logo
  const imgLogo = await preCargarLogoRankings('img/logo.png');

  agregarMembreteInstitucional(doc, "RANKING OFICIAL DE MÉRITOS - DOCENTES");

  const bodyData = listaDocentes.map((d, index) => [
    `#${index + 1}`,
    d.nombre,
    d.asignacion || '-',
    `${d.puntaje_acumulado || 0} pts`
  ]);

  doc.autoTable({
    startY: 30,
    head: [['Posición', 'Nombre Completo', 'Materia / Área', 'Puntaje']],
    body: bodyData,
    theme: 'grid',
    headStyles: { fillColor: [14, 42, 71], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { 
      fontSize: 8,
      fillColor: false // Permite ver el logo de fondo
    },
    didDrawPage: function (data) {
      if (imgLogo) {
        doc.saveGraphicsState();
        const opacityState = new doc.GState({ opacity: 0.2 });
        doc.setGState(opacityState);
        
        doc.addImage(imgLogo, 'PNG', 25, 70, 160, 160, undefined, 'FAST');
        
        doc.restoreGraphicsState();
      }
    }
  });

  doc.save('Ranking_Docentes_Santa_Rosa.pdf');
}

async function imprimirRankingAlumnosPDF() {
  if (listaAlumnos.length === 0) {
    alert("No hay datos cargados para generar el ranking.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  // Precargar Logo
  const imgLogo = await preCargarLogoRankings('img/logo.png');

  agregarMembreteInstitucional(doc, "RANKING OFICIAL DE MÉRITOS - ALUMNOS");

  const bodyData = listaAlumnos.map((a, index) => [
    `#${index + 1}`,
    a.nombre,
    a.asignacion || '-',
    `${a.puntaje_acumulado || 0} pts`
  ]);

  doc.autoTable({
    startY: 30,
    head: [['Posición', 'Nombre Completo', 'Aula / Grado', 'Puntaje']],
    body: bodyData,
    theme: 'grid',
    headStyles: { fillColor: [0, 102, 51], textColor: [255, 255, 255], fontStyle: 'bold' },
    styles: { 
      fontSize: 8,
      fillColor: false // Permite ver el logo de fondo
    },
    didDrawPage: function (data) {
      if (imgLogo) {
        doc.saveGraphicsState();
        const opacityState = new doc.GState({ opacity: 0.2 });
        doc.setGState(opacityState);
        
        doc.addImage(imgLogo, 'PNG', 25, 70, 160, 160, undefined, 'FAST');
        
        doc.restoreGraphicsState();
      }
    }
  });

  doc.save('Ranking_Alumnos_Santa_Rosa.pdf');
}