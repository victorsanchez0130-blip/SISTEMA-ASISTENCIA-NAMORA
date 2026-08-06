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

  // Si está en el login pero YA tiene sesión, redirigir a su vista principal
  if (isLoginPage) {
    window.location.href = 'escaner.html';
    return;
  }

  // 3. Normalizar el rol para evitar fallos de capitalización o espacios
  const userRol = (user.rol || '').trim().toLowerCase();
  
  // Normalizar el rol requerido (si se proporcionó)
  let rolesPermitidos = [];
  if (requiredRol) {
    if (Array.isArray(requiredRol)) {
      rolesPermitidos = requiredRol.map(r => r.trim().toLowerCase());
    } else {
      rolesPermitidos = [requiredRol.trim().toLowerCase()];
    }
  }

  // Roles con superacceso (siempre en minúsculas para comparar)
  const superRoles = ['director', 'directivo'];

  // 4. Validar permisos
  if (requiredRol && !rolesPermitidos.includes(userRol) && !superRoles.includes(userRol)) {
    alert('Acceso restringido: No tiene permisos suficientes para acceder a esta sección.');
    
    // CORRECCIÓN CLAVE: Si ya está en escaner.html y falla, enviarlo al index.html
    // Si falla en otra página, enviarlo a escaner.html (solo si es su panel por defecto)
    if (currentPage === 'escaner.html') {
      window.location.href = 'index.html';
    } else {
      window.location.href = 'escaner.html';
    }
  }
}

function logout() {
  localStorage.removeItem('user_session');
  localStorage.removeItem('usuario');
  window.location.href = 'index.html';
}