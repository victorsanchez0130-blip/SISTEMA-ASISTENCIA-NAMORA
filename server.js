const express = require('express');
const path = require('path');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configuración de la Base de Datos con soporte para Disco Persistente en Railway
const dbPath = process.env.RAILWAY_VOLUME_MOUNT_PATH 
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'asistencia.db') 
  : 'asistencia.db';

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Error al conectar con SQLite:', err.message);
  else console.log('Base de datos conectada correctamente en:', dbPath);
});

// Helper para obtener fecha actual en zona horaria de Perú (YYYY-MM-DD)
function getFechaPeru() {
  const d = new Date();
  const options = { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' };
  const parts = new Intl.DateTimeFormat('es-PE', options).formatToParts(d);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  return `${year}-${month}-${day}`;
}

// Helper para obtener hora actual en zona horaria de Perú (HH:MM:SS)
function getHoraPeru() {
  return new Date().toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour12: false });
}

// Creación de tablas e inserción de datos iniciales (A prueba de fallos UNIQUE)
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

  // Usar INSERT OR IGNORE previene colisiones con la restricción UNIQUE
  const stmt = db.prepare("INSERT OR IGNORE INTO usuarios (codigo, nombre, rol, materia_aula) VALUES (?, ?, ?, ?)");
  stmt.run('DIR-SRN-001', 'Director General', 'Director Manuel Asencio Málaga', 'Dirección General');
  stmt.finalize();
});

// API Login
app.post('/api/auth/login', (req, res) => {
  const { codigo } = req.body;
  if (!codigo) {
    return res.status(400).json({ success: false, mensaje: 'Por favor ingrese un código.' });
  }

  db.get('SELECT * FROM usuarios WHERE codigo = ?', [codigo.trim()], (err, usuario) => {
    if (err) {
      return res.status(500).json({ success: false, mensaje: 'Error interno en la base de datos.' });
    }
    if (!usuario) {
      return res.status(401).json({ success: false, mensaje: 'Código no encontrado en el sistema.' });
    }
    
    res.json({
      success: true,
      mensaje: 'Acceso concedido',
      usuario: {
        id: usuario.id,
        codigo: usuario.codigo,
        nombre: usuario.nombre,
        rol: usuario.rol,
        materia_aula: usuario.materia_aula
      }
    });
  });
});

// Listar Usuarios
app.get('/api/usuarios', (req, res) => {
  db.all('SELECT * FROM usuarios ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json([]);
    res.json(rows);
  });
});

// Crear Usuario
app.post('/api/usuarios', (req, res) => {
  const { nombre, rol, materia_aula } = req.body;

  let prefijo = 'ALU';
  if (rol === 'Docente') prefijo = 'DOC';
  if (rol === 'Auxiliar') prefijo = 'AUX';
  if (rol === 'Director') prefijo = 'DIR';

  const aleatorio = Math.floor(1000 + Math.random() * 9000);
  const codigoGenerado = `${prefijo}-SRN-${aleatorio}`;

  const queryInsert = `INSERT INTO usuarios (codigo, nombre, rol, materia_aula) VALUES (?, ?, ?, ?)`;
  
  db.run(queryInsert, [codigoGenerado, nombre, rol, materia_aula], function (err) {
    if (err) {
      return res.status(500).json({ success: false, mensaje: err.message });
    }
    res.json({
      success: true,
      codigo: codigoGenerado,
      id: this.lastID
    });
  });
});

// Editar Usuario
app.put('/api/usuarios/:id', (req, res) => {
  const { id } = req.params;
  const { nombre, rol, materia_aula } = req.body;
  db.run('UPDATE usuarios SET nombre = ?, rol = ?, materia_aula = ? WHERE id = ?', [nombre, rol, materia_aula, id], (err) => {
    if (err) return res.status(500).json({ success: false, mensaje: 'Error al actualizar' });
    res.json({ success: true });
  });
});

// Eliminar Usuario
app.delete('/api/usuarios/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT codigo FROM usuarios WHERE id = ?', [id], (err, row) => {
    if (row) {
      db.run('DELETE FROM asistencias WHERE usuario_codigo = ?', [row.codigo]);
      db.run('DELETE FROM usuarios WHERE id = ?', [id]);
    }
    res.json({ success: true });
  });
});

// Marcar Asistencia QR (Evita duplicados en el mismo día)
app.post('/api/asistencia/marcar', (req, res) => {
  const { codigoQR } = req.body;
  
  db.get('SELECT * FROM usuarios WHERE codigo = ?', [codigoQR], (err, usuario) => {
    if (err || !usuario) return res.status(404).json({ success: false, mensaje: 'Código QR no registrado.' });

    const hoy = getFechaPeru();
    const horaActual = getHoraPeru();

    // 🔍 Validar si el usuario ya marcó hoy
    db.get('SELECT * FROM asistencias WHERE usuario_codigo = ? AND fecha = ?', [codigoQR, hoy], (err, yaMarco) => {
      if (err) return res.status(500).json({ success: false, mensaje: 'Error al verificar marcación.' });

      if (yaMarco) {
        // Retornamos un estado duplicado
        return res.status(400).json({ 
          success: false, 
          duplicado: true,
          mensaje: `Atención: ${usuario.nombre} ya registró su asistencia el día de hoy a las ${yaMarco.hora}.`,
          usuario,
          horaAnterior: yaMarco.hora
        });
      }

      // Si no ha marcado hoy, procede a registrar
      const estado = horaActual > '08:00:00' ? 'TARDANZA' : 'PUNTUAL';

      db.run('INSERT INTO asistencias (usuario_codigo, fecha, hora, estado) VALUES (?, ?, ?, ?)', [codigoQR, hoy, horaActual, estado], (err) => {
        if (err) return res.status(500).json({ success: false, mensaje: 'Error al marcar.' });
        res.json({ success: true, mensaje: `Marcación [${estado}] registrada para ${usuario.nombre}`, usuario, hora: horaActual, estado });
      });
    });
  });
});

// NVO: API Obtener Marcaciones de Hoy (Dashboard/Cronograma)
app.get('/api/asistencia/hoy', (req, res) => {
  const hoy = getFechaPeru();
  const query = `
    SELECT 
      a.usuario_codigo AS codigo,
      u.nombre,
      u.materia_aula AS rol,
      a.hora,
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

// NVO: API Rankings y Sumatoria de Puntos Integrada
app.get('/api/rankings', (req, res) => {
  const query = `
    SELECT 
      u.codigo,
      u.nombre,
      u.rol,
      u.materia_aula AS asignacion,
      COALESCE(SUM(
        CASE 
          WHEN UPPER(a.estado) = 'PUNTUAL' THEN 2.0
          WHEN UPPER(a.estado) = 'TARDE' OR UPPER(a.estado) = 'TARDANZA' THEN 1.0
          WHEN UPPER(a.estado) = 'JUSTIFICADA' THEN 0.5 
          WHEN UPPER(a.estado) = 'INJUSTIFICADA' THEN 0.0
          ELSE 0
        END
      ), 0) AS puntaje_acumulado
    FROM usuarios u
    LEFT JOIN asistencias a ON u.codigo = a.usuario_codigo
    GROUP BY u.id
    ORDER BY puntaje_acumulado DESC
  `;

  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ success: false, docentes: [], alumnos: [] });

    const docentes = rows.filter(r => r.rol === 'Docente');
    const alumnos = rows.filter(r => r.rol === 'Alumno' || r.rol === 'Director');

    res.json({
      success: true,
      docentes,
      alumnos
    });
  });
});

// Modificar Asistencia Manual (Director)
app.post('/api/asistencia/manual', (req, res) => {
  const { usuario_codigo, fecha, estado } = req.body;
  db.get('SELECT id FROM asistencias WHERE usuario_codigo = ? AND fecha = ?', [usuario_codigo, fecha], (err, row) => {
    if (row) {
      db.run('UPDATE asistencias SET estado = ? WHERE id = ?', [estado, row.id]);
    } else {
      db.run('INSERT INTO asistencias (usuario_codigo, fecha, hora, estado) VALUES (?, ?, ?, ?)', [usuario_codigo, fecha, '08:00:00', estado]);
    }
    res.json({ success: true });
  });
});

// Reporte Consolidado
app.get('/api/reportes/consolidado', (req, res) => {
  db.all("SELECT * FROM usuarios WHERE rol = 'Alumno'", [], (err, usuarios) => {
    if (err) return res.status(500).json([]);

    db.all('SELECT * FROM asistencias', [], (err, asistencias) => {
      const consolidado = usuarios.map(u => {
        const marcaciones = asistencias.filter(a => a.usuario_codigo === u.codigo);
        let asistenciasCount = 0, tardanzas = 0, fJustificadas = 0, fInjustificadas = 0;

        marcaciones.forEach(m => {
          if (m.estado === 'PUNTUAL') asistenciasCount++;
          else if (m.estado === 'TARDANZA') tardanzas++;
          else if (m.estado === 'JUSTIFICADA') fJustificadas++;
          else if (m.estado === 'INJUSTIFICADA') fInjustificadas++;
        });

        const puntajeTotal = (asistenciasCount * 2.0) + (tardanzas * 1.0) + (fJustificadas * 0.5);

        return {
          id: u.id,
          codigo: u.codigo,
          nombre: u.nombre,
          rol: u.rol,
          aula: u.materia_aula || 'Sin Asignación',
          asistencias: asistenciasCount,
          tardanzas,
          fJustificadas,
          fInjustificadas,
          puntajeTotal
        };
      });
      res.json(consolidado);
    });
  });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo sin errores en el puerto ${PORT}`);
});