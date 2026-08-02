// Manejo de autenticación y sesiones
function checkAuth(requiredRol = null) {
  const user = JSON.parse(localStorage.getItem('user_session'));
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  if (requiredRol && user.rol !== requiredRol && user.rol !== 'Director') {
    alert('Acceso restringido: No tiene permisos suficientes.');
    window.location.href = 'escaner.html';
  }
}

function logout() {
  localStorage.removeItem('user_session');
  window.location.href = 'index.html';
}