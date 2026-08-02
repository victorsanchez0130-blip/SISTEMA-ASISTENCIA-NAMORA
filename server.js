const express = require('express');
const path = require('path');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000; // Correcto para Railway (asigna un puerto dinámico)

app.use(cors()); // Habilita peticiones cruzadas
app.use(express.json()); // Permite recibir body en JSON en tus endpoints
app.use(express.static(path.join(__dirname, 'public'))); // Sirve index.html y la web pública

// Inicialización de la Base de Datos SQLite
const db = new sqlite3.Database('asistencia.db', (err) => {
  if (err) console.error('Error al conectar con SQLite:', err.message);
  else console.log('Base de datos SQLite conectada correctamente.');
});

// Creación de tablas e inserción de datos iniciales
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

  // Insertar usuarios por defecto si no existen
  db.get("SELECT * FROM usuarios WHERE rol = 'Director'", (err, row) => {
    if (!row) {
      db.run("INSERT INTO usuarios (codigo, nombre, rol, materia_aula) VALUES ('DIR-SRN-001', 'Director General', 'Director', 'Dirección General')");
      db.run("INSERT INTO usuarios (codigo, nombre, rol, materia_aula) VALUES ('DOC-SRN-101', 'Mg. Pedro Alva', 'Docente', 'Matemática')");
      db.run("INSERT INTO usuarios (codigo, nombre, rol, materia_aula) VALUES ('ALU-SRN-001', 'María Gómez', 'Alumno', 'Secundaria 1ro A')");
    }
  });
});

// Login
app.post('/api/login', (req, res) => {
  const { codigo } = req.body;
  db.get('SELECT * FROM usuarios WHERE codigo = ?', [codigo], (err, usuario) => {
    if (err || !usuario) {
      return res.status(401).json({ success: false, mensaje: 'Código no encontrado en el sistema.' });
    }
    // Redirección según el Rol guardado
    res.json({
      success: true,
      usuario: {
        codigo: usuario.codigo,
        nombre: usuario.nombre,
        rol: usuario.rol, // "Docente", "Alumno", "Auxiliar", etc.
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
// Ruta para registrar un nuevo usuario
app.post('/api/usuarios', (req, res) => {
  const { nombre, rol, materia_aula } = req.body;

  // 1. Determinar el prefijo según el Rol
  let prefijo = 'ALU';
  if (rol === 'Docente') prefijo = 'DOC';
  if (rol === 'Auxiliar') prefijo = 'AUX';
  if (rol === 'Directivo' || rol === 'Director') prefijo = 'DIR';

  // 2. Obtener el último correlativo registrado para ese rol
  const queryUltimo = `SELECT codigo FROM usuarios WHERE rol = ? ORDER BY id DESC LIMIT 1`;

  db.get(queryUltimo, [rol], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    let nuevoNumero = 1;

    if (row && row.codigo) {
      // Extraer los últimos dígitos del código previo (ej: DOC-SRN-101 -> 101)
      const partes = row.codigo.split('-');
      const ultimoNumero = parseInt(partes[partes.length - 1], 10);
      if (!isNaN(ultimoNumero)) {
        nuevoNumero = ultimoNumero + 1;
      }
    }

    // Formatear el código (Ej: DOC-SRN-101, ALU-SRN-101, etc.)
    const codigoGenerado = `${prefijo}-SRN-${nuevoNumero}`;

    // 3. Guardar el usuario con su rol exacto y nuevo código
    const queryInsert = `INSERT INTO usuarios (codigo, nombre, rol, materia_aula) VALUES (?, ?, ?, ?)`;
    db.run(queryInsert, [codigoGenerado, nombre, rol, materia_aula], function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.json({
        success: true,
        codigo: codigoGenerado,
        id: this.lastID
      });
    });
  });
});

// Editar Usuario
app.put('/api/usuarios/:id', (req, res) => {
  const { id } = req.params;
  const { nombre, rol, materia_aula } = req.body;
  db.run('UPDATE usuarios SET nombre = ?, rol = ?, materia_aula = ? WHERE id = ?', [nombre, rol, materia_aula, id], (err) => {
    if (err) return res.status(500).json({ success: false });
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
  db.get('SELECT * FROM usuarios WHERE codigo = ?', [codigoQR], (err, usuario) => {
    if (err || !usuario) return res.status(404).json({ success: false, message: 'Código QR no registrado.' });

    const hoy = new Date().toISOString().slice(0, 10);
    const horaActual = new Date().toLocaleTimeString('es-PE', { hour12: false });
    const estado = horaActual > '08:00:00' ? 'TARDANZA' : 'PUNTUAL';

    db.run('INSERT INTO asistencias (usuario_codigo, fecha, hora, estado) VALUES (?, ?, ?, ?)', [codigoQR, hoy, horaActual, estado], (err) => {
      if (err) return res.status(500).json({ success: false, message: 'Error al marcar.' });
      res.json({ success: true, message: `Marcación [${estado}] registrada para ${usuario.nombre}`, user: usuario });
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
  db.all('SELECT * FROM usuarios', [], (err, usuarios) => {
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
          aula: u.materia_aula,
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
  console.log(`Servidor corriendo sin errores en http://localhost:${PORT}`);
});