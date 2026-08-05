const express = require('express');
const path = require('path');
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
      estado TEXT NOT NULL,
      tipo_marcacion TEXT DEFAULT 'ENTRADA'
    )
  `);

  const stmt = db.prepare("INSERT OR IGNORE INTO usuarios (codigo, nombre, rol, materia_aula) VALUES (?, ?, ?, ?)");
  stmt.run('DIR-SRN-001', 'Director Manuel Asencio Málaga', 'Director', 'Dirección General');
  stmt.finalize();
});

app.post('/api/auth/login', (req, res) => {
  const { codigo } = req.body;
  if (!codigo) {
    return res.status(400).json({ success: false, mensaje: 'Por favor ingrese un código.' });
  }

  db.get('SELECT * FROM usuarios WHERE UPPER(codigo) = UPPER(?)', [codigo.trim()], (err, usuario) => {
    if (err) return res.status(500).json({ success: false, mensaje: 'Error interno en la base de datos.' });
    if (!usuario) return res.status(401).json({ success: false, mensaje: 'Código no encontrado en el sistema.' });
    
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

  db.run(`INSERT INTO usuarios (codigo, nombre, rol, materia_aula) VALUES (?, ?, ?, ?)`, [codigoGenerado, nombre, rol, materia_aula], function (err) {
    if (err) return res.status(500).json({ success: false, mensaje: err.message });
    res.json({ success: true, codigo: codigoGenerado, id: this.lastID });
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
  const { codigoQR, tipoMarcacion } = req.body;
  const tipoM = (tipoMarcacion || 'ENTRADA').toUpperCase();
  
  db.get('SELECT * FROM usuarios WHERE UPPER(codigo) = UPPER(?)', [codigoQR], (err, usuario) => {
    if (err || !usuario) return res.status(404).json({ success: false, mensaje: 'Código QR no registrado.' });

    const hoy = getFechaPeru();
    const horaActual = getHoraPeru();

    db.get('SELECT * FROM asistencias WHERE usuario_codigo = ? AND fecha = ? AND tipo_marcacion = ?', [usuario.codigo, hoy, tipoM], (err, yaMarco) => {
      if (err) return res.status(500).json({ success: false, mensaje: 'Error al verificar marcación.' });

      if (yaMarco) {
        return res.status(400).json({ 
          success: false, 
          duplicado: true,
          mensaje: `Atención: ${usuario.nombre} ya registró su ${tipoM.toLowerCase()} el día de hoy a las ${yaMarco.hora}.`,
          usuario,
          horaAnterior: yaMarco.hora
        });
      }

      let estado = 'PUNTUAL';
      if (tipoM === 'ENTRADA') {
        estado = horaActual > '07:30:00' ? 'TARDANZA' : 'PUNTUAL';
      } else {
        estado = 'SALIDA';
      }

      db.run('INSERT INTO asistencias (usuario_codigo, fecha, hora, estado, tipo_marcacion) VALUES (?, ?, ?, ?, ?)', [usuario.codigo, hoy, horaActual, estado, tipoM], (err) => {
        if (err) return res.status(500).json({ success: false, mensaje: 'Error al marcar.' });
        res.json({ success: true, mensaje: `Marcación de ${tipoM} [${estado}] registrada para ${usuario.nombre}`, usuario, hora: horaActual, estado });
      });
    });
  });
});

app.post('/api/asistencia/finalizar-ingreso', (req, res) => {
  const hoy = getFechaPeru();
  const horaActual = getHoraPeru();

  db.all("SELECT codigo FROM usuarios WHERE LOWER(rol) LIKE '%alumno%' OR rol IS NULL OR rol = ''", [], (err, alumnos) => {
    if (err) return res.status(500).json({ success: false, mensaje: 'Error al consultar alumnos.' });

    db.all("SELECT usuario_codigo FROM asistencias WHERE fecha = ? AND tipo_marcacion = 'ENTRADA'", [hoy], (err2, marcados) => {
      if (err2) return res.status(500).json({ success: false, mensaje: 'Error al consultar asistencias.' });

      const codigosMarcados = new Set(marcados.map(m => m.usuario_codigo));
      let faltasRegistradas = 0;

      const stmt = db.prepare("INSERT INTO asistencias (usuario_codigo, fecha, hora, estado, tipo_marcacion) VALUES (?, ?, ?, 'INJUSTIFICADA', 'ENTRADA')");

      alumnos.forEach(alu => {
        if (!codigosMarcados.has(alu.codigo)) {
          stmt.run(alu.codigo, hoy, horaActual);
          faltasRegistradas++;
        }
      });

      stmt.finalize((err3) => {
        if (err3) return res.status(500).json({ success: false, mensaje: 'Error al guardar faltas automáticas.' });
        res.json({ success: true, mensaje: `Ingreso finalizado. Se registraron ${faltasRegistradas} faltas automáticas por inasistencia.` });
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
      a.estado,
      a.tipo_marcacion
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

app.post('/api/asistencia/editar', (req, res) => {
  const { codigo, estado, fecha } = req.body;
  if (!codigo || !estado || !fecha) {
    return res.status(400).json({ success: false, mensaje: 'Faltan datos obligatorios.' });
  }

  db.get('SELECT id FROM asistencias WHERE usuario_codigo = ? AND fecha = ? AND tipo_marcacion = \'ENTRADA\'', [codigo, fecha], (err, row) => {
    if (row) {
      db.run('UPDATE asistencias SET estado = ? WHERE id = ?', [estado, row.id], () => {
        res.json({ success: true, mensaje: 'Asistencia actualizada.' });
      });
    } else {
      db.run('INSERT INTO asistencias (usuario_codigo, fecha, hora, estado, tipo_marcacion) VALUES (?, ?, ?, ?, \'ENTRADA\')', [codigo, fecha, '07:30:00', estado], () => {
        res.json({ success: true, mensaje: 'Asistencia registrada.' });
      });
    }
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
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

function calcularFechasRango(tipo, fecha) {
  let fechaInicio = fecha || getFechaPeru();
  let fechaFin = fecha || getFechaPeru();

  if (tipo === 'Semanal') {
    const lunesStr = obtenerLunesISO(fecha);
    if (lunesStr) {
      fechaInicio = lunesStr;
      fechaFin = sumarDiasFecha(lunesStr, 4);
    }
  } else if (tipo === 'Mensual') {
    const partes = (fecha || '').split('-');
    if (partes.length >= 2) {
      const anio = parseInt(partes[0], 10);
      const mes = parseInt(partes[1], 10);
      const ultimoDia = new Date(anio, mes, 0).getDate();
      fechaInicio = `${partes[0]}-${String(mes).padStart(2, '0')}-01`;
      fechaFin = `${partes[0]}-${String(mes).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
    }
  }
  return { fechaInicio, fechaFin };
}

app.get('/api/reportes/consolidado', (req, res) => {
  let { tipo, fecha } = req.query;
  const { fechaInicio, fechaFin } = calcularFechasRango(tipo, fecha);

  db.all("SELECT * FROM usuarios", [], (err, usuarios) => {
    if (err) return res.status(500).json([]);

    db.all('SELECT * FROM asistencias WHERE fecha >= ? AND fecha <= ? AND tipo_marcacion = \'ENTRADA\'', [fechaInicio, fechaFin], (err, asistencias) => {
      if (err) return res.status(500).json([]);

      const consolidado = usuarios.map(u => {
        const marcaciones = asistencias.filter(a => a.usuario_codigo === u.codigo);
        let asistenciasCount = 0, tardanzas = 0, faltas = 0;

        marcaciones.forEach(m => {
          const estado = (m.estado || '').toUpperCase();
          if (estado === 'PUNTUAL' || estado === 'ASISTENCIA') asistenciasCount++;
          else if (estado === 'TARDANZA' || estado === 'TARDE') tardanzas++;
          else if (estado === 'INJUSTIFICADA' || estado === 'FALTA') faltas++;
        });

        const puntajeTotal = (asistenciasCount * 2.0) + (tardanzas * 1.0);

        return {
          id: u.id,
          codigo: u.codigo,
          nombre: u.nombre,
          rol: u.rol || 'Alumno',
          aula: u.materia_aula || 'Sin Asignación',
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

app.get('/api/rankings', (req, res) => {
  db.all("SELECT * FROM usuarios", [], (err, usuarios) => {
    if (err) return res.status(500).json({ success: false, docentes: [], alumnos: [] });

    db.all("SELECT * FROM asistencias WHERE tipo_marcacion = 'ENTRADA'", [], (err, asistencias) => {
      if (err) return res.status(500).json({ success: false, docentes: [], alumnos: [] });

      const listaCompleta = usuarios.map(u => {
        const marcaciones = asistencias.filter(a => a.usuario_codigo === u.codigo);
        let asistenciasCount = 0, tardanzas = 0;

        marcaciones.forEach(m => {
          const estado = (m.estado || '').toUpperCase();
          if (estado === 'PUNTUAL' || estado === 'ASISTENCIA') asistenciasCount++;
          else if (estado === 'TARDANZA' || estado === 'TARDE') tardanzas++;
        });

        const puntajeTotal = (asistenciasCount * 2.0) + (tardanzas * 1.0);

        return {
          id: u.id,
          codigo: u.codigo,
          nombre: u.nombre,
          rol: u.rol || 'Alumno',
          materia_aula: u.materia_aula || 'Sin Asignación',
          puntajeTotal
        };
      });

      const docentes = listaCompleta
        .filter(u => (u.rol || '').toLowerCase().includes('docente'))
        .sort((a, b) => b.puntajeTotal - a.puntajeTotal);

      const alumnos = listaCompleta
        .filter(u => (u.rol || '').toLowerCase().includes('alumno') || !u.rol || u.rol === '')
        .sort((a, b) => b.puntajeTotal - a.puntajeTotal);

      res.json({ success: true, docentes, alumnos });
    });
  });
});

app.get('/api/reportes/historial-detallado', (req, res) => {
  const { codigo, tipo, fecha } = req.query;
  const { fechaInicio, fechaFin } = calcularFechasRango(tipo, fecha);

  let query = `
    SELECT 
      a.fecha,
      a.hora,
      a.estado,
      a.tipo_marcacion,
      u.codigo,
      u.nombre,
      u.materia_aula AS aula,
      u.rol
    FROM asistencias a
    JOIN usuarios u ON a.usuario_codigo = u.codigo
    WHERE a.fecha >= ? AND a.fecha <= ?
  `;
  let params = [fechaInicio, fechaFin];

  if (codigo && codigo !== 'todos' && codigo !== 'PERSONAL-DOCENTE' && !codigo.startsWith('AULA-')) {
    query += ` AND a.usuario_codigo = ?`;
    params.push(codigo);
  } else if (codigo === 'PERSONAL-DOCENTE') {
    query += ` AND LOWER(u.rol) LIKE '%docente%'`;
  } else if (codigo && codigo.startsWith('AULA-')) {
    query += ` AND (u.materia_aula LIKE ?)`;
    const partesGrado = codigo.replace('AULA-', '').split('-');
    params.push(`%${partesGrado[0]}%`);
  }

  query += ` ORDER BY a.fecha DESC, a.hora DESC`;

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json([]);
    res.json(rows || []);
  });
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});