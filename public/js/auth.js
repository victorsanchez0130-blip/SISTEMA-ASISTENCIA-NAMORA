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
  const currentPage = window.location.pathname.split('/').pop().toLowerCase() || 'index.html';
  const isLoginPage = currentPage === 'index.html' || currentPage === '';

  // 2. Si no hay usuario activo y no está en el login, redirigir al login
  if (!user) {
    if (!isLoginPage) {
      window.location.href = 'index.html';
    }
    return;
  }

  // 3. Normalizar el rol a minúsculas
  const userRol = (user.rol || '').trim().toLowerCase();

  // 4. Si el usuario YA tiene sesión activa e intenta cargar 'index.html', redirigirlo a su página inicial correspondiente
  if (isLoginPage) {
    switch (userRol) {
      case 'director':
      case 'admin':
      case 'directivo':
      case 'docente':
        window.location.href = 'dashboard.html';
        break;
      case 'auxiliar':
        window.location.href = 'escaner.html';
        break;
      case 'alumno':
      case 'estudiante':
        window.location.href = 'rankings.html';
        break;
      default:
        localStorage.clear();
        window.location.href = 'index.html';
        break;
    }
    return;
  }

  // --- MATRIZ DE PERMISOS POR ROL ---

  // DIRECTOR (y aliases Admin/Directivo): Acceso TOTAL
  if (['director', 'admin', 'directivo'].includes(userRol)) {
    return; // Pasa sin restricciones
  }

  // DOCENTE: Solo Dashboard, Reportes y Rankings
  if (userRol === 'docente') {
    const paginasDocente = ['dashboard.html', 'reportes.html', 'rankings.html'];
    if (!paginasDocente.includes(currentPage)) {
      alert('Acceso restringido: Los docentes solo tienen acceso a Dashboard, Reportes y Rankings.');
      window.location.href = 'dashboard.html';
    }
    return;
  }

  // AUXILIAR: Solo Escáner
  if (userRol === 'auxiliar') {
    if (currentPage !== 'escaner.html') {
      alert('Acceso restringido: Los auxiliares solo tienen acceso al módulo Escáner.');
      window.location.href = 'escaner.html';
    }
    return;
  }

  // ALUMNO: Solo Rankings
  if (userRol === 'alumno' || userRol === 'estudiante') {
    if (currentPage !== 'rankings.html') {
      alert('Acceso restringido: Los alumnos solo tienen acceso a la sección Rankings.');
      window.location.href = 'rankings.html';
    }
    return;
  }

  // CUALQUIER OTRO ROL NO RECONOCIDO
  alert('Acceso denegado: Su rol no cuenta con permisos válidos.');
  logout();
}

function logout() {
  localStorage.removeItem('user_session');
  localStorage.removeItem('usuario');
  localStorage.clear();
  window.location.href = 'index.html';
}

// Ejecutar automáticamente la validación al cargar el script
checkAuth();