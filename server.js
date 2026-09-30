const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('❌ Falta la variable MONGODB_URI');
  process.exit(1);
}

const client = new MongoClient(uri);
let db;

async function connectDB() {
  await client.connect();
  db = client.db('eisenhower');
  console.log('✅ Conectado a MongoDB Atlas');
}
connectDB().catch(err => {
  console.error('❌ Error de conexión:', err);
  process.exit(1);
});

function serialize(t) {
  return {
    id: t._id.toString(),
    name: t.name,
    important: t.important,
    urgent: t.urgent,
    completed: !!t.completed,
    dueDate: t.dueDate || null,
    createdAt: t.createdAt,
    completedAt: t.completedAt || null
  };
}

// Guarda la fecha como string YYYY-MM-DD, sin conversión a Date (evita bug de zona horaria)
function parseDueDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];
  return null;
}

// GET todas las tareas
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await db.collection('tasks').find().sort({ createdAt: -1 }).toArray();
    res.json(tasks.map(serialize));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener tareas' });
  }
});

// POST crear tarea
app.post('/api/tasks', async (req, res) => {
  try {
    const { name, important, urgent, dueDate } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'El nombre es obligatorio' });
    }

    const doc = {
      name: name.trim(),
      important: Boolean(important),
      urgent: Boolean(urgent),
      completed: false,
      completedAt: null,
      dueDate: parseDueDate(dueDate),
      createdAt: new Date()
    };

    const result = await db.collection('tasks').insertOne(doc);
    res.status(201).json(serialize({ _id: result.insertedId, ...doc }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al crear la tarea' });
  }
});

// PATCH actualizar tarea
app.patch('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const update = {};
    if (typeof req.body.completed === 'boolean') {
      update.completed = req.body.completed;
      update.completedAt = req.body.completed ? new Date() : null;
    }
    if (typeof req.body.name === 'string' && req.body.name.trim()) {
      update.name = req.body.name.trim();
    }
    if (typeof req.body.important === 'boolean') update.important = req.body.important;
    if (typeof req.body.urgent === 'boolean') update.urgent = req.body.urgent;
    if (req.body.dueDate !== undefined) {
      update.dueDate = parseDueDate(req.body.dueDate);
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'Nada que actualizar' });
    }

    const raw = await db.collection('tasks').findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: update },
      { returnDocument: 'after' }
    );

    const doc = raw && raw.value !== undefined ? raw.value : raw;
    if (!doc) return res.status(404).json({ error: 'Tarea no encontrada' });
    res.json(serialize(doc));
  } catch (err) {
    console.error('❌ Error en PATCH /api/tasks/:id →', err);
    res.status(500).json({ error: 'Error al actualizar la tarea', detail: String(err) });
  }
});

// DELETE eliminar tarea
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const result = await db.collection('tasks').deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Tarea no encontrada' });
    }
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar la tarea' });
  }
});

// Catch-all: sirve el index.html para cualquier otra ruta
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor en puerto ${PORT}`);
});