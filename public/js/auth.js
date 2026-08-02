// Manejo de autenticación y sesiones

// 1. Función para iniciar sesión
async function login() {
  // Obtener el valor del input usando la ID exacta de tu HTML
  const codigoInput = document.getElementById('login-codigo');
  const codigo = codigoInput ? codigoInput.value.trim() : '';

  if (!codigo) {
    alert('Por favor, ingrese un código de usuario.');
    return;
  }

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo })
    });

    const data = await response.json();

    if (data.success) {
      // Guardar la sesión en localStorage
      localStorage.setItem('user_session', JSON.stringify(data.usuario));

      // Redireccionar según el rol recibido
      const rol = data.usuario.rol;
      if (rol === 'Director' || rol === 'Directivo') {
        window.location.href = 'dashboard.html';
      } else if (rol === 'Docente') {
        window.location.href = 'inscripciones.html';
      } else {
        window.location.href = 'escaner.html';
      }
    } else {
      alert(data.mensaje || 'Código no encontrado en el sistema.');
    }
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    alert('No se pudo conectar con el servidor.');
  }
}

// 2. Control de permisos por vista
function checkAuth(requiredRol = null) {
  const user = JSON.parse(localStorage.getItem('user_session'));
  
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  
  // Permite el acceso si el usuario coincide con el rol requerido o si es Director
  if (requiredRol && user.rol !== requiredRol && user.rol !== 'Director' && user.rol !== 'Directivo') {
    alert('Acceso restringido: No tiene permisos suficientes.');
    window.location.href = 'escaner.html';
  }
}

// 3. Cerrar sesión
function logout() {
  localStorage.removeItem('user_session');
  window.location.href = 'index.html';
}