const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = 3000;
const JWT_SECRET = 'secreto_super_seguro_cambiar_en_produccion';

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static('./')); // Servir archivos estáticos del frontend

// --- CONEXIÓN A BASE DE DATOS SQLITE ---
const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) console.error('Error al conectar con SQLite:', err);
  else console.log('Base de datos SQLite conectada correctamente.');
});

// --- INICIALIZACIÓN DE TABLAS ---
db.serialize(() => {
  // 1. Usuarios
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ci TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL
    )
  `);

  // 2. Cursos
  db.run(`
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      description TEXT,
      teacher_ci TEXT NOT NULL,
      FOREIGN KEY (teacher_ci) REFERENCES users (ci)
    )
  `);

  // 3. Inscripciones / Matriculaciones
  db.run(`
    CREATE TABLE IF NOT EXISTS enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      student_ci TEXT NOT NULL,
      FOREIGN KEY (course_id) REFERENCES courses (id),
      FOREIGN KEY (student_ci) REFERENCES users (ci),
      UNIQUE(course_id, student_ci)
    )
  `);

  // 4. Anuncios / Novedades
  db.run(`
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      date TEXT NOT NULL,
      FOREIGN KEY (course_id) REFERENCES courses (id)
    )
  `);

  // 5. Materiales
  db.run(`
    CREATE TABLE IF NOT EXISTS materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      FOREIGN KEY (course_id) REFERENCES courses (id)
    )
  `);

  // 6. Tareas
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      FOREIGN KEY (course_id) REFERENCES courses (id)
    )
  `);
});

// --- MIDDLEWARE DE AUTENTICACIÓN JWT ---
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido o expirado.' });
    req.user = user;
    next();
  });
}

// --- HELPER DE VERIFICACIÓN DE PROPIEDAD DEL CURSO ---
// Valida que el usuario sea el docente creador del curso antes de realizar cambios
function verifyCourseOwner(req, res, next) {
  const courseId = req.params.id;
  const userCi = req.user.ci;
  const userRole = req.user.role;

  if (userRole !== 'docente') {
    return res.status(403).json({ error: 'Solo los docentes pueden realizar esta acción.' });
  }

  db.get('SELECT teacher_ci FROM courses WHERE id = ?', [courseId], (err, course) => {
    if (err) return res.status(500).json({ error: 'Error interno en la base de datos.' });
    if (!course) return res.status(404).json({ error: 'Curso no encontrado.' });

    if (course.teacher_ci !== userCi) {
      return res.status(403).json({ error: 'Acceso denegado: No tienes permiso para modificar este curso.' });
    }

    next();
  });
}

// ==========================================================================
// 1. RUTAS DE AUTENTICACIÓN Y USUARIOS
// ==========================================================================

app.get('/api/check-ci/:ci', (req, res) => {
  const { ci } = req.params;
  const { role } = req.query;

  db.get('SELECT id, name, role FROM users WHERE ci = ? AND role = ?', [ci, role], (err, row) => {
    if (err) return res.status(500).json({ error: 'Error interno del servidor.' });
    if (row) {
      return res.json({ exists: true, user: { name: row.name, role: row.role } });
    }
    return res.json({ exists: false });
  });
});

app.post('/api/register', async (req, res) => {
  const { ci, name, password, role } = req.body;

  if (!ci || !name || !password || !role) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const stmt = db.prepare('INSERT INTO users (ci, name, password, role) VALUES (?, ?, ?, ?)');

    stmt.run([ci, name, hashedPassword, role], function (err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'La cédula ya se encuentra registrada.' });
        }
        return res.status(500).json({ error: 'Error al crear la cuenta.' });
      }

      const token = jwt.sign({ id: this.lastID, ci, role }, JWT_SECRET, { expiresIn: '8h' });

      return res.status(201).json({
        message: 'Cuenta creada exitosamente.',
        token,
        user: { ci, name, role }
      });
    });
    stmt.finalize();
  } catch (err) {
    res.status(500).json({ error: 'Error al procesar la seguridad de la contraseña.' });
  }
});

app.post('/api/login', (req, res) => {
  const { ci, password, role } = req.body;

  if (!ci || !password || !role) {
    return res.status(400).json({ error: 'Completa todos los datos requeridos.' });
  }

  db.get('SELECT * FROM users WHERE ci = ? AND role = ?', [ci, role], async (err, user) => {
    if (err) return res.status(500).json({ error: 'Error interno del servidor.' });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Contraseña incorrecta.' });
    }

    const token = jwt.sign({ id: user.id, ci: user.ci, role: user.role }, JWT_SECRET, { expiresIn: '8h' });

    return res.json({
      message: 'Inicio de sesión correcto.',
      token,
      user: { ci: user.ci, name: user.name, role: user.role }
    });
  });
});

// ==========================================================================
// 2. RUTAS DE CURSOS Y AULAS VIRTUALES CON CONTROL DE ACCESO
// ==========================================================================

// Obtener solo los cursos propios del usuario
app.get('/api/courses', authenticateToken, (req, res) => {
  const { ci, role } = req.user;

  if (role === 'docente') {
    const query = `
      SELECT c.*, u.name as profesor 
      FROM courses c 
      JOIN users u ON c.teacher_ci = u.ci 
      WHERE c.teacher_ci = ?
    `;
    db.all(query, [ci], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error al consultar tus cursos.' });
      res.json(rows);
    });
  } else {
    const query = `
      SELECT c.*, u.name as profesor 
      FROM courses c 
      JOIN enrollments e ON c.id = e.course_id 
      JOIN users u ON c.teacher_ci = u.ci 
      WHERE e.student_ci = ?
    `;
    db.all(query, [ci], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error al consultar tus cursos.' });
      res.json(rows);
    });
  }
});

// Crear nuevo curso
app.post('/api/courses', authenticateToken, (req, res) => {
  if (req.user.role !== 'docente') {
    return res.status(403).json({ error: 'Solo los docentes pueden crear cursos.' });
  }

  const { title, category, code, description } = req.body;
  const teacher_ci = req.user.ci;

  if (!title || !category || !code) {
    return res.status(400).json({ error: 'Completa los campos obligatorios del curso.' });
  }

  const stmt = db.prepare('INSERT INTO courses (title, category, code, description, teacher_ci) VALUES (?, ?, ?, ?, ?)');
  stmt.run([title, category, code.toUpperCase(), description, teacher_ci], function (err) {
    if (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'Ese código de acceso ya existe.' });
      }
      return res.status(500).json({ error: 'Error al crear el curso.' });
    }

    res.status(201).json({
      id: this.lastID,
      title,
      category,
      code: code.toUpperCase(),
      description,
      teacher_ci
    });
  });
  stmt.finalize();
});

// Unirse a un curso (Estudiantes)
app.post('/api/courses/join', authenticateToken, (req, res) => {
  if (req.user.role !== 'estudiante') {
    return res.status(403).json({ error: 'Solo los estudiantes pueden matricularse a cursos.' });
  }

  const { code } = req.body;
  const student_ci = req.user.ci;

  db.get('SELECT id FROM courses WHERE code = ?', [code.toUpperCase().trim()], (err, course) => {
    if (err) return res.status(500).json({ error: 'Error en el servidor.' });
    if (!course) return res.status(404).json({ error: 'No existe ningún curso con ese código.' });

    const stmt = db.prepare('INSERT INTO enrollments (course_id, student_ci) VALUES (?, ?)');
    stmt.run([course.id, student_ci], function (err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Ya estás inscripto en este curso.' });
        }
        return res.status(500).json({ error: 'Error al unirse al curso.' });
      }

      res.json({ message: 'Te has matriculado con éxito.', courseId: course.id });
    });
    stmt.finalize();
  });
});

// Obtener detalles completos de un aula virtual (VALIDACIÓN DE ACCESO RIGUROSA)
app.get('/api/courses/:id', authenticateToken, (req, res) => {
  const courseId = req.params.id;
  const { ci, role } = req.user;

  db.get('SELECT c.*, u.name as profesor FROM courses c JOIN users u ON c.teacher_ci = u.ci WHERE c.id = ?', [courseId], (err, course) => {
    if (err || !course) return res.status(404).json({ error: 'Curso no encontrado.' });

    // Validar acceso: Si es docente debe ser el creador. Si es estudiante debe estar inscripto.
    if (role === 'docente' && course.teacher_ci !== ci) {
      return res.status(403).json({ error: 'Acceso denegado: Este curso no te pertenece.' });
    }

    if (role === 'estudiante') {
      db.get('SELECT id FROM enrollments WHERE course_id = ? AND student_ci = ?', [courseId, ci], (err, enrollment) => {
        if (err || !enrollment) {
          return res.status(403).json({ error: 'Acceso denegado: No estás inscripto en este curso.' });
        }
        fetchCourseData(course, req, res);
      });
    } else {
      fetchCourseData(course, req, res);
    }
  });
});

// Función auxiliar para cargar los contenidos del aula
function fetchCourseData(course, req, res) {
  const courseId = course.id;
  const result = { course };

  db.all('SELECT * FROM announcements WHERE course_id = ? ORDER BY id DESC', [courseId], (err, announcements) => {
    result.announcements = announcements || [];

    db.all('SELECT * FROM materials WHERE course_id = ?', [courseId], (err, materials) => {
      result.materials = materials || [];

      db.all('SELECT * FROM tasks WHERE course_id = ?', [courseId], (err, tasks) => {
        result.tasks = tasks || [];

        const queryStudents = `
          SELECT u.ci, u.name 
          FROM users u 
          JOIN enrollments e ON u.ci = e.student_ci 
          WHERE e.course_id = ?
        `;
        db.all(queryStudents, [courseId], (err, students) => {
          result.students = students || [];
          res.json(result);
        });
      });
    });
  });
}

// Editar la información de un Curso (Solo el Docente Creador)
app.put('/api/courses/:id', authenticateToken, verifyCourseOwner, (req, res) => {
  const courseId = req.params.id;
  const { title, category, description } = req.body;

  if (!title || !category) {
    return res.status(400).json({ error: 'El título y la categoría son obligatorios.' });
  }

  const stmt = db.prepare('UPDATE courses SET title = ?, category = ?, description = ? WHERE id = ?');
  stmt.run([title, category, description, courseId], function (err) {
    if (err) return res.status(500).json({ error: 'Error al actualizar el curso.' });
    res.json({ message: 'Curso actualizado correctamente.', course: { id: courseId, title, category, description } });
  });
  stmt.finalize();
});

// Publicar Anuncio (Solo el Docente Creador)
app.post('/api/courses/:id/announcements', authenticateToken, verifyCourseOwner, (req, res) => {
  const courseId = req.params.id;
  const { text } = req.body;
  const date = new Date().toLocaleDateString();

  if (!text) return res.status(400).json({ error: 'El mensaje del anuncio no puede estar vacío.' });

  const stmt = db.prepare('INSERT INTO announcements (course_id, text, date) VALUES (?, ?, ?)');
  stmt.run([courseId, text, date], function (err) {
    if (err) return res.status(500).json({ error: 'Error al guardar anuncio.' });
    res.status(201).json({ id: this.lastID, text, date });
  });
  stmt.finalize();
});

// Publicar Material (Solo el Docente Creador)
app.post('/api/courses/:id/materials', authenticateToken, verifyCourseOwner, (req, res) => {
  const courseId = req.params.id;
  const { title, url } = req.body;

  if (!title || !url) return res.status(400).json({ error: 'Título y URL requeridos.' });

  const stmt = db.prepare('INSERT INTO materials (course_id, title, url) VALUES (?, ?, ?)');
  stmt.run([courseId, title, url], function (err) {
    if (err) return res.status(500).json({ error: 'Error al guardar material.' });
    res.status(201).json({ id: this.lastID, title, url });
  });
  stmt.finalize();
});

// Crear Tarea (Solo el Docente Creador)
app.post('/api/courses/:id/tasks', authenticateToken, verifyCourseOwner, (req, res) => {
  const courseId = req.params.id;
  const { title, description } = req.body;

  if (!title || !description) return res.status(400).json({ error: 'Título y descripción de la tarea son requeridos.' });

  const stmt = db.prepare('INSERT INTO tasks (course_id, title, description) VALUES (?, ?, ?)');
  stmt.run([courseId, title, description], function (err) {
    if (err) return res.status(500).json({ error: 'Error al crear la tarea.' });
    res.status(201).json({ id: this.lastID, title, description });
  });
  stmt.finalize();
});

// --- INICIAR SERVIDOR ---
app.listen(PORT, () => {
  console.log(`Servidor Backend ejecutándose en http://localhost:${PORT}`);
});