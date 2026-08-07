const express = require('path') ? require('express') : require('express'); // Asegurado
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

// Middleware de verificación de permisos
function verificarPermisoAdmin(req, res, next) {
  const userRol = (req.headers['x-user-rol'] || req.body.rol_editor || '').trim().toLowerCase();
  if (['admin', 'director', 'directivo', 'auxiliar'].includes(userRol)) {
    next();
  } else {
    return res.status(403).json({ 
      success: false, 
      mensaje: 'Acceso denegado: No cuenta con los permisos necesarios.' 
    });
  }
}

// Inicialización de esquema y datos base
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      rol TEXT NOT NULL,
      materia_aula TEXT DEFAULT ''
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS asistencias (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_codigo TEXT NOT NULL,
      fecha TEXT NOT NULL,
      hora TEXT NOT NULL,
      estado TEXT NOT NULL
    )
  `);

  const stmt = db.prepare("INSERT OR IGNORE INTO usuarios (codigo, nombre, rol, materia_aula) VALUES (?, ?, ?, ?)");
  stmt.run('DIR-SRN-001', 'Manuel Asencio Málaga', 'Director', 'Dirección General');
  stmt.finalize();
});

// Control de Jornada
app.post('/api/asistencia/iniciar', (req, res) => {
  registroActivo = true;
  res.json({ success: true, mensaje: 'Registro de asistencia iniciado con éxito.' });
});

app.post('/api/asistencia/cerrar', (req, res) => {
  registroActivo = false;
  const hoy = getFechaPeru();

  db.all("SELECT codigo FROM usuarios WHERE LOWER(rol) IN ('alumno', 'docente')", [], (err, usuarios) => {
    if (err) return res.status(500).json({ success: false, mensaje: 'Error al consultar usuarios.' });

    db.all("SELECT usuario_codigo FROM asistencias WHERE fecha = ?", [hoy], (err, marcaciones) => {
      if (err) return res.status(500).json({ success: false, mensaje: 'Error al validar marcaciones.' });

      const marcadosSet = new Set(marcaciones.map(m => m.usuario_codigo));
      const ausentes = usuarios.filter(u => !marcadosSet.has(u.codigo));

      if (ausentes.length === 0) {
        return res.json({ success: true, mensaje: 'Registro cerrado. Todo el personal registró asistencia.' });
      }

      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        const stmt = db.prepare("INSERT INTO asistencias (usuario_codigo, fecha, hora, estado) VALUES (?, ?, '00:00:00', 'FALTA')");
        ausentes.forEach(u => stmt.run(u.codigo, hoy));
        stmt.finalize();
        db.run('COMMIT', (errCommit) => {
          if (errCommit) return res.status(500).json({ success: false, mensaje: 'Error al procesar faltas automáticas.' });
          res.json({ success: true, mensaje: `Asistencia cerrada. Se asignaron ${ausentes.length} faltas automáticas.` });
        });
      });
    });
  });
});

// Autenticación
app.post('/api/auth/login', (req, res) => {
  const { codigo } = req.body;
  if (!codigo) return res.status(400).json({ success: false, mensaje: 'Ingrese un código.' });

  db.get('SELECT * FROM usuarios WHERE UPPER(codigo) = UPPER(?)', [codigo.trim()], (err, usuario) => {
    if (err) return res.status(500).json({ success: false, mensaje: 'Error en la base de datos.' });
    if (!usuario) return res.status(401).json({ success: false, mensaje: 'Código no encontrado.' });
    
    const rolNormalizado = (usuario.rol || '').trim().toLowerCase();
    let redirectUrl = 'escaner.html';
    if (['admin', 'director', 'directivo', 'docente'].includes(rolNormalizado)) redirectUrl = 'dashboard.html';

    res.json({
      success: true,
      mensaje: 'Acceso concedido',
      redirectUrl,
      usuario
    });
  });
});

// Listado y CRUD de Usuarios
app.get('/api/usuarios', (req, res) => {
  db.all('SELECT * FROM usuarios ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json([]);
    res.json(rows || []);
  });
});

app.post('/api/usuarios', verificarPermisoAdmin, (req, res) => {
  const { nombre, rol, materia_aula } = req.body;
  let prefijo = 'ALU';
  const rolUpper = (rol || '').toUpperCase();
  if (rolUpper === 'DOCENTE') prefijo = 'DOC';
  if (rolUpper === 'AUXILIAR') prefijo = 'AUX';
  if (rolUpper === 'DIRECTOR' || rolUpper === 'ADMIN') prefijo = 'DIR';

  const codigoGenerado = `${prefijo}-SRN-${Math.floor(1000 + Math.random() * 9000)}`;

  db.run(`INSERT INTO usuarios (codigo, nombre, rol, materia_aula) VALUES (?, ?, ?, ?)`, [codigoGenerado, nombre, rol, materia_aula], function (err) {
    if (err) return res.status(500).json({ success: false, mensaje: err.message });
    res.json({ success: true, codigo: codigoGenerado, id: this.lastID });
  });
});

// MARCACIÓN (Unificado para aceptar tanto /marcar como /registrar por compatibilidad)
const procesarMarcacionLogica = (req, res) => {
  // Soporte tanto para codigoQR como codigo
  const codigoQR = req.body.codigoQR || req.body.codigo;

  if (!codigoQR) {
    return res.status(400).json({ success: false, mensaje: 'Código no proporcionado.' });
  }

  db.get('SELECT * FROM usuarios WHERE UPPER(codigo) = UPPER(?)', [codigoQR.trim()], (err, usuario) => {
    if (err || !usuario) return res.status(404).json({ success: false, mensaje: 'Código QR no registrado en el sistema.' });

    const hoy = getFechaPeru();
    const horaActual = getHoraPeru();

    db.get('SELECT * FROM asistencias WHERE usuario_codigo = ? AND fecha = ?', [usuario.codigo, hoy], (err, yaMarco) => {
      if (err) return res.status(500).json({ success: false, mensaje: 'Error al verificar marcación.' });

      if (yaMarco) {
        return res.json({ 
          success: true, 
          duplicado: true,
          mensaje: `${usuario.nombre} ya registró asistencia hoy a las ${yaMarco.hora}.`,
          persona: usuario,
          usuario
        });
      }

      const estado = horaActual > '07:30:00' ? 'TARDANZA' : 'PUNTUAL';

      db.run('INSERT INTO asistencias (usuario_codigo, fecha, hora, estado) VALUES (?, ?, ?, ?)', [usuario.codigo, hoy, horaActual, estado], (err) => {
        if (err) return res.status(500).json({ success: false, mensaje: 'Error al registrar marcación.' });
        res.json({ 
          success: true, 
          mensaje: `Marcación [${estado}] registrada para ${usuario.nombre}`, 
          persona: usuario,
          usuario, 
          hora: horaActual, 
          estado 
        });
      });
    });
  });
};

app.post('/api/asistencia/marcar', procesarMarcacionLogica);
app.post('/api/asistencia/registrar', procesarMarcacionLogica);

app.get('/api/asistencia/hoy', (req, res) => {
  const hoy = getFechaPeru();
  const query = `
    SELECT 
      a.usuario_codigo AS codigo,
      u.nombre,
      u.materia_aula AS aula,
      u.rol,
      a.hora AS hora_entrada,
      a.hora AS hora_salida,
      a.estado
    FROM asistencias a
    JOIN usuarios u ON a.usuario_codigo = u.codigo
    WHERE a.fecha = ?
    ORDER BY a.id DESC
  `;
  db.all(query, [hoy], (err, rows) => {
    if (err) return res.status(500).json([]);
    res.json(rows || []);
  });
});

// Edición y corrección manual de asistencia
app.post('/api/asistencia/editar', verificarPermisoAdmin, (req, res) => {
  const { codigo, fecha, estado } = req.body;
  if (!codigo || !fecha || !estado) return res.status(400).json({ success: false, mensaje: 'Datos incompletos.' });

  db.get('SELECT id FROM asistencias WHERE usuario_codigo = ? AND fecha = ?', [codigo, fecha], (err, row) => {
    if (row) {
      db.run('UPDATE asistencias SET estado = ? WHERE id = ?', [estado, row.id], (err2) => {
        if (err2) return res.status(500).json({ success: false, mensaje: 'Error al actualizar.' });
        res.json({ success: true, mensaje: 'Asistencia actualizada.' });
      });
    } else {
      db.run('INSERT INTO asistencias (usuario_codigo, fecha, hora, estado) VALUES (?, ?, ?, ?)', [codigo, fecha, '07:30:00', estado], (err2) => {
        if (err2) return res.status(500).json({ success: false, mensaje: 'Error al registrar.' });
        res.json({ success: true, mensaje: 'Asistencia creada de forma manual.' });
      });
    }
  });
});

app.get('/api/reportes/consolidado', (req, res) => {
  db.all("SELECT * FROM usuarios WHERE LOWER(rol) = 'alumno' OR rol IS NULL", [], (err, usuarios) => {
    if (err) return res.status(500).json([]);
    db.all("SELECT * FROM asistencias", [], (err, asistencias) => {
      if (err) return res.status(500).json([]);

      const consolidado = usuarios.map(u => {
        const marcaciones = asistencias.filter(a => a.usuario_codigo === u.codigo);
        let asistenciasCount = 0, tardanzas = 0, fJustificadas = 0, fInjustificadas = 0;

        marcaciones.forEach(m => {
          const est = (m.estado || '').toUpperCase();
          if (est === 'PUNTUAL' || est === 'ASISTENCIA') asistenciasCount++;
          else if (est === 'TARDANZA' || est === 'TARDE') tardanzas++;
          else if (est === 'JUSTIFICADA') fJustificadas++;
          else if (est === 'INJUSTIFICADA' || est === 'FALTA') fInjustificadas++;
        });

        return {
          id: u.id,
          codigo: u.codigo,
          nombre: u.nombre,
          rol: u.rol || 'Alumno',
          aula: u.materia_aula || 'Sin Asignación',
          asistencias: asistenciasCount,
          tardanzas,
          fJustificadas,
          fInjustificadas,
          puntajeTotal: (asistenciasCount * 2.0) + (tardanzas * 1.0)
        };
      });
      res.json(consolidado);
    });
  });
});

app.get('/api/reportes/historial-detallado', (req, res) => {
  const { codigo } = req.query;
  let query = `
    SELECT a.fecha, a.hora, a.estado, u.codigo, u.nombre, u.materia_aula AS aula
    FROM asistencias a JOIN usuarios u ON a.usuario_codigo = u.codigo
  `;
  const params = [];
  if (codigo && codigo !== 'todos') {
    query += ` WHERE a.usuario_codigo = ?`;
    params.push(codigo);
  }
  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json([]);
    res.json(rows || []);
  });
});

app.listen(PORT, () => {
  console.log(`Servidor optimizado ejecutándose en el puerto ${PORT}`);
});