// Manejo de autenticación y sesiones
function checkAuth(requiredRol = null) {
  // 1. Obtener la sesión (soporta 'user_session' o 'usuario')
  const sessionData = localStorage.getItem('user_session') || localStorage.getItem('usuario');
  let user = null;

  try {
    user = JSON.parse(sessionData);
  } catch (e) {
    console.error('Error al parsear la sesión:', e);
  }

  // Identificar página actual
  const currentPage = window.location.pathname.split('/').pop().toLowerCase();
  const isLoginPage = currentPage === 'index.html' || currentPage === '';

  // 2. Si no hay usuario activo y no está en el login, redirigir
  if (!user) {
    if (!isLoginPage) {
      window.location.href = 'index.html';
    }
    return;
  }

  // 3. Normalizar el rol
  const userRol = (user.rol || '').trim().toLowerCase();

  // Si está en el login pero YA tiene sesión activa, redirigir a su vista autorizada
  if (isLoginPage) {
    if (['admin', 'director', 'directivo'].includes(userRol)) {
      window.location.href = 'dashboard.html';
    } else if (userRol === 'docente') {
      window.location.href = 'dashboard.html';
    } 
    return;
  }

  // --- MATRIZ DE PERMISOS POR ROL ---
  // ADMIN: Acceso total a todas las páginas.
  if (['admin', 'director', 'directivo'].includes(userRol)) {
    return; // Pasa sin restricciones
  }

  // DOCENTE: Solo Dashboard, Reportes y Rankings
  const paginasDocente = ['dashboard.html', 'reportes.html', 'rankings.html'];
  if (userRol === 'docente') {
    if (!paginasDocente.includes(currentPage)) {
      alert('Acceso restringido: Los docentes solo tienen acceso a Dashboard, Reportes y Rankings.');
      window.location.href = 'dashboard.html';
    }
    return;
  }

  // AUXILIAR: Solo Escáner
  if (userRol === 'auxiliar') {
    if (currentPage !== 'escaner.html') {
      alert('Acceso restringido: Los auxiliares solo tienen acceso al Escáner.');
      window.location.href = 'escaner.html';
    }
    return;
  }

  // OTROS ROLES/ALUMNOS: Redirigir por defecto al inicio
  alert('Acceso denegado: Su rol no tiene permisos asignados.');
  window.location.href = 'index.html';
}

function logout() {
  localStorage.removeItem('user_session');
  localStorage.removeItem('usuario');
  window.location.href = 'index.html';
}