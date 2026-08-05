const express = require('express');
const path = path = require('path');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
  stmt.run('DIR-SRN-001', 'Director Manuel Asencio Málaga', 'Director', 'Dirección General');
  stmt.finalize();

  db.run(`
    UPDATE usuarios 
    SET rol = 'Director', nombre = 'Director Manuel Asencio Málaga', materia_aula = 'Dirección General'
    WHERE codigo = 'DIR-SRN-001'
  `, (err) => {
    if (err) console.error("Error al corregir el rol del Director:", err.message);
    else console.log("Rol de Director verificado y actualizado correctamente.");
  });
});

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

app.get('/api/usuarios', (req, res) => {
  db.all('SELECT * FROM usuarios ORDER BY id DESC', [], (err, rows) => {
    if (err) return res.status(500).json([]);
    res.json(rows || []);
  });
});

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

app.put('/api/usuarios/:id', (req, res) => {
  const { id } = req.params;
  const { nombre, rol, materia_aula } = req.body;
  db.run('UPDATE usuarios SET nombre = ?, rol = ?, materia_aula = ? WHERE id = ?', [nombre, rol, materia_aula, id], (err) => {
    if (err) return res.status(500).json({ success: false, mensaje: 'Error al actualizar' });
    res.json({ success: true });
  });
});

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

app.post('/api/asistencia/manual', (req, res) => {
  const { usuario_codigo, fecha, estado } = req.body;
  db.get('SELECT id FROM asistencias WHERE usuario_codigo = ? AND fecha = ?', [usuario_codigo, fecha], (err, row) => {
    if (row) {
      db.run('UPDATE asistencias SET estado = ? WHERE id = ?', [estado, row.id]);
    } else {
      db.run('INSERT INTO asistencias (usuario_codigo, fecha, hora, estado) VALUES (?, ?, ?, ?)', [usuario_codigo, fecha, '07:30:00', estado]);
    }
    res.json({ success: true });
  });
});

function obtenerLunesISO(valorWeek) {
  if (!valorWeek || !valorWeek.includes('-W')) return null;
  const partes = valorWeek.split('-W');
  const anio = parseInt(partes[0], 10);
  const semana = parseInt(partes[1], 10);

  const simple = new Date(anio, 0, 4);
  const day = simple.getDay() || 7;
  simple.setDate(simple.getDate() - day + 1);
  simple.setDate(simple.getDate() + (semana - 1) * 7);

  const a = simple.getFullYear();
  const m = String(simple.getMonth() + 1).padStart(2, '0');
  const d = String(simple.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

function sumarDiasFecha(fechaStr, dias) {
  const partes = fechaStr.split('-');
  const f = new Date(parseInt(partes[0], 10), parseInt(partes[1], 10) - 1, parseInt(partes[2], 10));
  f.setDate(f.getDate() + dias);
  const a = f.getFullYear();
  const m = String(f.getMonth() + 1).padStart(2, '0');
  const d = String(f.getDate()).padStart(2, '0');
  return `${a}-${m}-${d}`;
}

// Endpoint Consolidado Optimizado
app.get('/api/reportes/consolidado', (req, res) => {
  let { tipo, fecha } = req.query;

  if (!fecha) {
    fecha = getFechaPeru();
  }

  let fechaInicio = fecha;
  let fechaFin = fecha;

  if (tipo === 'Semanal') {
    const lunesStr = obtenerLunesISO(fecha);
    if (lunesStr) {
      fechaInicio = lunesStr;
      fechaFin = sumarDiasFecha(lunesStr, 4);
    }
  } else if (tipo === 'Mensual') {
    const partes = fecha.split('-');
    if (partes.length >= 2) {
      const anio = parseInt(partes[0], 10);
      const mes = parseInt(partes[1], 10);
      const ultimoDia = new Date(anio, mes, 0).getDate();
      fechaInicio = `${partes[0]}-${String(mes).padStart(2, '0')}-01`;
      fechaFin = `${partes[0]}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
    }
  }

  db.all("SELECT * FROM usuarios WHERE LOWER(rol) = 'alumno' OR rol IS NULL OR rol = ''", [], (err, usuarios) => {
    if (err) return res.status(500).json([]);

    let sqlAsistencias = 'SELECT * FROM asistencias';
    let params = [];

    if (fechaInicio && fechaFin) {
      sqlAsistencias += ' WHERE fecha >= ? AND fecha <= ?';
      params = [fechaInicio, fechaFin];
    }

    db.all(sqlAsistencias, params, (err, asistencias) => {
      if (err) return res.status(500).json([]);

      const consolidado = usuarios.map(u => {
        const marcaciones = asistencias.filter(a => a.usuario_codigo === u.codigo);
        let asistenciasCount = 0, tardanzas = 0, fJustificadas = 0, fInjustificadas = 0;

        marcaciones.forEach(m => {
          const estado = (m.estado || '').toUpperCase();
          if (estado === 'PUNTUAL' || estado === 'ASISTENCIA') asistenciasCount++;
          else if (estado === 'TARDANZA' || estado === 'TARDE') tardanzas++;
          else if (estado === 'JUSTIFICADA') fJustificadas++;
          else if (estado === 'INJUSTIFICADA' || estado === 'FALTA') fInjustificadas++;
        });

        const puntajeTotal = (asistenciasCount * 2.0) + (tardanzas * 1.0) + (fJustificadas * 0.5);

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
          puntajeTotal
        };
      });

      res.json(consolidado);
    });
  });
});

// Endpoint para obtener el historial detallado de asistencias día a día para los PDF
app.get('/api/reportes/historial-detallado', (req, res) => {
  const { codigo, fechaInicio, fechaFin } = req.query;

  let query = `
    SELECT 
      a.fecha,
      a.hora,
      a.estado,
      u.codigo,
      u.nombre,
      u.materia_aula AS aula
    FROM asistencias a
    JOIN usuarios u ON a.usuario_codigo = u.codigo
    WHERE 1=1
  `;
  let params = [];

  if (codigo && codigo !== 'todos') {
    query += ` AND a.usuario_codigo = ?`;
    params.push(codigo);
  }

  if (fechaInicio && fechaFin) {
    query += ` AND a.fecha >= ? AND a.fecha <= ?`;
    params.push(fechaInicio, fechaFin);
  }

  query += ` ORDER BY a.fecha DESC, a.hora DESC`;

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json([]);
    res.json(rows || []);
  });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo sin errores en el puerto ${PORT}`);
});