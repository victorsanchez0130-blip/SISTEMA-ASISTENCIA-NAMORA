const express = require('express');
const path = require('path');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Estado global para controlar si la toma de asistencia está habilitada
let registroActivo = false;

const dbPath = process.env.RAILWAY_VOLUME_MOUNT_PATH 
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'asistencia.db') 
  : 'asistencia.db';

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Error al conectar con SQLite:', err.message);
  else console.log('Base de datos conectada correctamente en:', dbPath);
});

// --- FUNCIONES DE UTILIDAD ---

function getFechaPeru() {
  const d = new Date();
  const options = { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' };
  const parts = new Intl.DateTimeFormat('es-PE', options).formatToParts(d);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  return `${year}-${month}-${day}`;
}

function getHoraPeru() {
  return new Date().toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour12: false });
}

// Middleware de seguridad: Verifica que solo usuarios con rol administrativo realicen cambios críticos
function verificarPermisoAdmin(req, res, next) {
  const userRol = (req.headers['x-user-rol'] || '').trim().toLowerCase();
  if (['admin', 'director', 'directivo'].includes(userRol)) {
    next();
  } else {
    return res.status(403).json({ success: false, mensaje: 'Acceso denegado: Requiere permisos de administrador.' });
  }
}

// --- INICIALIZACIÓN DE ESQUEMA ---
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT UNIQUE NOT NULL, nombre TEXT NOT NULL, rol TEXT NOT NULL, materia_aula TEXT DEFAULT '')`);
  db.run(`CREATE TABLE IF NOT EXISTS asistencias (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_codigo TEXT NOT NULL, fecha TEXT NOT NULL, hora TEXT NOT NULL, estado TEXT NOT NULL)`);
});

// --- ENDPOINTS DE CONTROL DE ASISTENCIA ---

app.post('/api/asistencia/iniciar', (req, res) => {
  registroActivo = true;
  res.json({ success: true, mensaje: 'Registro de asistencia iniciado.' });
});

app.post('/api/asistencia/cerrar', (req, res) => {
  if (!registroActivo) return res.status(400).json({ success: false, mensaje: 'El registro no está activo.' });
  registroActivo = false;
  const hoy = getFechaPeru();

  db.all("SELECT codigo FROM usuarios WHERE LOWER(rol) IN ('alumno', 'docente')", [], (err, usuarios) => {
    db.all("SELECT usuario_codigo FROM asistencias WHERE fecha = ?", [hoy], (err, marcaciones) => {
      const marcadosSet = new Set(marcaciones.map(m => m.usuario_codigo));
      const ausentes = usuarios.filter(u => !marcadosSet.has(u.codigo));

      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        const stmt = db.prepare("INSERT INTO asistencias (usuario_codigo, fecha, hora, estado) VALUES (?, ?, '00:00:00', 'FALTA')");
        ausentes.forEach(u => stmt.run(u.codigo, hoy));
        stmt.finalize();
        db.run('COMMIT');
        res.json({ success: true, mensaje: `Asistencia cerrada. ${ausentes.length} faltas registradas.` });
      });
    });
  });
});

// --- GESTIÓN DE USUARIOS (CRUD) ---

// Crear usuario (Admin)
app.post('/api/usuarios', verificarPermisoAdmin, (req, res) => {
  const { nombre, rol, materia_aula } = req.body;
  const prefijo = (rol || '').toUpperCase().substring(0, 3);
  const codigoGenerado = `${prefijo}-SRN-${Math.floor(1000 + Math.random() * 9000)}`;
  
  db.run(`INSERT INTO usuarios (codigo, nombre, rol, materia_aula) VALUES (?, ?, ?, ?)`, 
    [codigoGenerado, nombre, rol, materia_aula], function(err) {
      if (err) return res.status(500).json({ success: false, mensaje: err.message });
      res.json({ success: true, codigo: codigoGenerado });
    });
});

// Actualizar usuario (Admin)
app.put('/api/usuarios/:id', verificarPermisoAdmin, (req, res) => {
  const { nombre, rol, materia_aula } = req.body;
  db.run('UPDATE usuarios SET nombre = ?, rol = ?, materia_aula = ? WHERE id = ?', 
    [nombre, rol, materia_aula, req.params.id], (err) => {
      if (err) return res.status(500).json({ success: false, mensaje: 'Error al actualizar.' });
      res.json({ success: true, mensaje: 'Usuario actualizado.' });
    });
});

// Eliminar usuario (Admin - Borra en cascada registros de asistencia)
app.delete('/api/usuarios/:id', verificarPermisoAdmin, (req, res) => {
  db.get('SELECT codigo FROM usuarios WHERE id = ?', [req.params.id], (err, row) => {
    if (row) {
      db.run('DELETE FROM asistencias WHERE usuario_codigo = ?', [row.codigo]);
      db.run('DELETE FROM usuarios WHERE id = ?', [req.params.id]);
      res.json({ success: true, mensaje: 'Usuario y registros eliminados.' });
    } else {
      res.status(404).json({ success: false, mensaje: 'Usuario no encontrado.' });
    }
  });
});

// --- REGISTRO Y MODIFICACIÓN MANUAL DE ASISTENCIA ---

// Endpoint POST para crear o modificar asistencia (soluciona la discrepancia de rutas)
app.post('/api/asistencia/manual', verificarPermisoAdmin, (req, res) => {
  const { usuario_codigo, fecha, estado } = req.body;
  // Busca si ya existe un registro para ese usuario en esa fecha
  db.get('SELECT id FROM asistencias WHERE usuario_codigo = ? AND fecha = ?', [usuario_codigo, fecha], (err, row) => {
    if (row) {
      // Si existe, actualizamos el estado
      db.run('UPDATE asistencias SET estado = ? WHERE id = ?', [estado, row.id], (err) => {
        if (err) return res.status(500).json({ success: false, mensaje: 'Error al actualizar.' });
        res.json({ success: true, mensaje: 'Asistencia actualizada.' });
      });
    } else {
      // Si no existe, creamos uno nuevo
      db.run('INSERT INTO asistencias (usuario_codigo, fecha, hora, estado) VALUES (?, ?, ?, ?)', 
        [usuario_codigo, fecha, '07:30:00', estado], (err) => {
          if (err) return res.status(500).json({ success: false, mensaje: 'Error al registrar.' });
          res.json({ success: true, mensaje: 'Asistencia creada.' });
      });
    }
  });
});

// --- LISTADOS Y REPORTES ---

app.get('/api/usuarios', (req, res) => {
  db.all('SELECT * FROM usuarios ORDER BY id DESC', [], (err, rows) => res.json(rows || []));
});

app.get('/api/asistencia/hoy', (req, res) => {
  const hoy = getFechaPeru();
  const query = `SELECT a.usuario_codigo AS codigo, u.nombre, u.materia_aula AS rol, a.hora, a.estado FROM asistencias a JOIN usuarios u ON a.usuario_codigo = u.codigo WHERE a.fecha = ?`;
  db.all(query, [hoy], (err, rows) => res.json(rows || []));
});

app.listen(PORT, () => {
  console.log(`Servidor activo en puerto ${PORT}`);
});