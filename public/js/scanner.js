let html5QrcodeScanner;
let lastCode = null;

document.addEventListener("DOMContentLoaded", () => {
  checkAuth();
  initScanner();
  loadMarcaciones();
});

function initScanner() {
  html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
  html5QrcodeScanner.render(onScanSuccess);
}

async function onScanSuccess(decodedText) {
  if (decodedText === lastCode) return;
  lastCode = decodedText;

  const res = await fetch('/api/asistencia/marcar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigoQR: decodedText })
  });

  const data = await res.json();
  const feedback = document.getElementById('scan-feedback');
  feedback.classList.remove('hidden', 'bg-green-100', 'bg-red-100', 'text-green-700', 'text-red-700');
  
  if (data.success) {
    feedback.classList.add('bg-green-100', 'text-green-700');
    feedback.innerText = data.message;
    loadMarcaciones();
  } else {
    feedback.classList.add('bg-red-100', 'text-red-700');
    feedback.innerText = data.message;
  }
}

async function loadMarcaciones() {
  const res = await fetch('/api/reportes/consolidado');
  const data = await res.json();
  const tbody = document.getElementById('today-records-body');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  data.forEach(item => {
    tbody.innerHTML += `
      <tr class="border-b border-slate-100 text-xs">
        <td class="p-2 font-mono">${item.codigo}</td>
        <td class="p-2 font-medium">${item.nombre}</td>
        <td class="p-2 text-center">${item.asistencias > 0 ? '<span class="px-2 py-0.5 rounded badge-puntual font-bold">REGISTRADO</span>' : '<span class="px-2 py-0.5 rounded badge-injustificada font-bold">SIN MARCACIÓN</span>'}</td>
      </tr>
    `;
  });
}