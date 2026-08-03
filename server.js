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

// Creación de tablas y actualización forzada del rol del Director
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

  // 1. Insertar el registro si no existe
  const stmt = db.prepare("INSERT OR IGNORE INTO usuarios (codigo, nombre, rol, materia_aula) VALUES (?, ?, ?, ?)");
  stmt.run('DIR-SRN-001', 'Director Manuel Asencio Málaga', 'Director', 'Dirección General');
  stmt.finalize();

  // 2. FORZAR la corrección del rol y nombre por si fue editado o guardado como 'Docente'
  db.run(`
    UPDATE usuarios 
    SET rol = 'Director', nombre = 'Director Manuel Asencio Málaga', materia_aula = 'Dirección General'
    WHERE codigo = 'DIR-SRN-001'
  `, (err) => {
    if (err) console.error("Error al corregir el rol del Director:", err.message);
    else console.log("Rol de Director verificado y actualizado correctamente.");
  });
});

// API Login
app.post('/api/auth/login', (req, res) => {
  const { codigo } = req.body;
  if (!codigo) {
    return res.status(400).json({ success: false, mensaje: 'Por favor ingrese un código.' });
  }

  db.get('SELECT * FROM usuarios WHERE UPPER(codigo) = UPPER(?)', [codigo.trim()], (err, usuario) => {
    if (err) {
      return res.status(500).json({ success: false, mensaje: 'Error interno en la base de datos.' });
    }
    if (!usuario) {
      return res.status(401).json({ success: false, mensaje: 'Código no encontrado en el sistema.' });
    }
    
    // Normalizamos el rol para evitar problemas de mayúsculas/minúsculas
    const rolNormalizado = (usuario.rol || '').trim();

    res.json({
      success: true,
      mensaje: 'Acceso concedido',
      redirectUrl: rolNormalizado === 'Director' ? 'dashboard.html' : 'escaner.html',
      usuario: {
        id: usuario.id,
        codigo: usuario.codigo,
        nombre: usuario.nombre,
        rol: rolNormalizado,
        materia_aula: usuario.materia_aula
      }
    });
  });
});

// Listar Usuarios
app.get('/api/usuarios', (req, res) => {
  db.all('SELECT * FROM usuarios ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json([]);
    res.json(rows || []);
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

// Marcar Asistencia QR
app.post('/api/asistencia/marcar', (req, res) => {
  const { codigoQR } = req.body;
  
  db.get('SELECT * FROM usuarios WHERE UPPER(codigo) = UPPER(?)', [codigoQR], (err, usuario) => {
    if (err || !usuario) return res.status(404).json({ success: false, mensaje: 'Código QR no registrado.' });

    const hoy = getFechaPeru();
    const horaActual = getHoraPeru();

    db.get('SELECT * FROM asistencias WHERE usuario_codigo = ? AND fecha = ?', [usuario.codigo, hoy], (err, yaMarco) => {
      if (err) return res.status(500).json({ success: false, mensaje: 'Error al verificar marcación.' });

      if (yaMarco) {
        return res.status(400).json({ 
          success: false, 
          duplicado: true,
          mensaje: `Atención: ${usuario.nombre} ya registró su asistencia el día de hoy a las ${yaMarco.hora}.`,
          usuario,
          horaAnterior: yaMarco.hora
        });
      }

      const estado = horaActual > '07:30:00' ? 'TARDANZA' : 'PUNTUAL';

      db.run('INSERT INTO asistencias (usuario_codigo, fecha, hora, estado) VALUES (?, ?, ?, ?)', [usuario.codigo, hoy, horaActual, estado], (err) => {
        if (err) return res.status(500).json({ success: false, mensaje: 'Error al marcar.' });
        res.json({ success: true, mensaje: `Marcación [${estado}] registrada para ${usuario.nombre}`, usuario, hora: horaActual, estado });
      });
    });
  });
});

// API Obtener Marcaciones de Hoy
app.get('/api/asistencia/hoy', (req, res) => {
  const hoy = getFechaPeru();
  const query = `
    SELECT 
      a.usuario_codigo AS codigo,
      u.nombre,
      u.materia_aula AS rol,
      a.hora,
      CASE 
        WHEN UPPER(a.estado) IN ('FALTA JUSTIFICADA', 'FALTA INJUSTIFICADA') THEN 'FALTA'
        ELSE UPPER(a.estado)
      END AS estado
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

// =========================================================================
// NVO ENDPOINT: OBTENER ASISTENCIA HISTÓRICA EXACTA POR CÓDIGO DE ALUMNO
// =========================================================================
app.get('/api/asistencias/alumno/:codigo', (req, res) => {
  const { codigo } = req.params;
  const sql = `
    SELECT 
      a.id,
      a.usuario_codigo AS codigo,
      a.fecha,
      a.hora,
      a.estado
    FROM asistencias a
    WHERE UPPER(a.usuario_codigo) = UPPER(?)
    ORDER BY a.fecha DESC, a.hora DESC
  `;

  db.all(sql, [codigo.trim()], (err, rows) => {
    if (err) {
      console.error('Error al obtener asistencias del alumno:', err.message);
      return res.status(500).json([]);
    }
    res.json(rows || []);
  });
});

// API Rankings (Excluye al Director y unifica Faltas a 0 puntos)
app.get('/api/rankings', (req, res) => {
  const query = `
    SELECT 
      u.codigo,
      u.nombre,
      u.rol,
      u.materia_aula AS asignacion,
      COALESCE(SUM(
        CASE 
          WHEN UPPER(a.estado) IN ('PUNTUAL', 'ASISTIÓ') THEN 2.0
          WHEN UPPER(a.estado) = 'TARDANZA' THEN 1.0
          WHEN UPPER(a.estado) LIKE '%FALTA%' THEN 0.0
          ELSE 0
        END
      ), 0) AS puntaje_acumulado
    FROM usuarios u
    LEFT JOIN asistencias a ON u.codigo = a.usuario_codigo
    WHERE u.rol IN ('Docente', 'Alumno')
    GROUP BY u.id
    ORDER BY puntaje_acumulado DESC
  `;

  db.all(query, [], (err, rows) => {
    if (err) return res.status(500).json({ success: false, docentes: [], alumnos: [] });

    const docentes = rows.filter(r => r.rol === 'Docente');
    const alumnos = rows.filter(r => r.rol === 'Alumno');

    res.json({
      success: true,
      docentes,
      alumnos
    });
  });
});

// Modificar Asistencia Manual
app.post('/api/asistencia/manual', (req, res) => {
  const { usuario_codigo, fecha, estado } = req.body;

  // Unificamos el estado si viene como justificada/injustificada
  const estadoNormalizado = (estado || '').toUpperCase().includes('FALTA') ? 'FALTA' : estado;

  db.get('SELECT id FROM asistencias WHERE usuario_codigo = ? AND fecha = ?', [usuario_codigo, fecha], (err, row) => {
    if (row) {
      db.run('UPDATE asistencias SET estado = ? WHERE id = ?', [estadoNormalizado, row.id]);
    } else {
      db.run('INSERT INTO asistencias (usuario_codigo, fecha, hora, estado) VALUES (?, ?, ?, ?)', [usuario_codigo, fecha, '07:30:00', estadoNormalizado]);
    }
    res.json({ success: true });
  });
});

// Reporte Consolidado (Para Alumnos y Docentes)
app.get('/api/reportes/consolidado', (req, res) => {
  db.all("SELECT * FROM usuarios WHERE rol IN ('Alumno', 'Docente', 'Auxiliar')", [], (err, usuarios) => {
    if (err) return res.status(500).json([]);

    db.all('SELECT * FROM asistencias', [], (err, asistencias) => {
      const consolidado = usuarios.map(u => {
        const marcaciones = asistencias.filter(a => a.usuario_codigo === u.codigo);
        let asistenciasCount = 0, tardanzas = 0, faltas = 0;

        marcaciones.forEach(m => {
          const est = (m.estado || '').toUpperCase();
          if (est === 'PUNTUAL' || est === 'ASISTIÓ') asistenciasCount++;
          else if (est === 'TARDANZA') tardanzas++;
          else if (est.includes('FALTA') || est === 'JUSTIFICADA' || est === 'INJUSTIFICADA') faltas++;
        });

        // Cálculo de puntaje unificado: Puntual = 2pts, Tardanza = 1pt, Falta = 0pts
        const puntajeTotal = (asistenciasCount * 2.0) + (tardanzas * 1.0);

        return {
          id: u.id,
          codigo: u.codigo,
          nombre: u.nombre,
          rol: u.rol,
          aula: u.materia_aula || 'Sin Asignación',
          materia_aula: u.materia_aula || 'Sin Asignación',
          asistencias: asistenciasCount,
          tardanzas,
          faltas,
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
