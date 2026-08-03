// Manejo de autenticación y sesiones
function checkAuth(requiredRol = null) {
  // 1. Obtener la sesión (soporta 'user_session' o 'usuario')
  const user = JSON.parse(localStorage.getItem('user_session') || localStorage.getItem('usuario'));

  // Prevenir bucles si ya estamos en la página de inicio de sesión
  const currentPage = window.location.pathname.split('/').pop();
  if (!user) {
    if (currentPage !== 'index.html' && currentPage !== '') {
      window.location.href = 'index.html';
    }
    return;
  }

  // 2. Normalizar el rol para evitar fallos por mayúsculas/espacios
  const userRol = (user.rol || '').trim();

  // 3. Validar permisos (El Director y Directivo tienen pase libre a cualquier sección)
  if (requiredRol && userRol !== requiredRol && userRol !== 'Director' && userRol !== 'Directivo') {
    alert('Acceso restringido: No tiene permisos suficientes.');
    window.location.href = 'escaner.html';
  }
}

function logout() {
  localStorage.removeItem('user_session');
  localStorage.removeItem('usuario');
  window.location.href = 'index.html';
}