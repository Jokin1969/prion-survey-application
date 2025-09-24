import fs from 'fs';
import path from 'path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import nodemailer from 'nodemailer';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const __dirname = path.resolve();

// --- Config ---
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'production';
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const RESEARCH_EMAIL = process.env.RESEARCH_EMAIL;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'data.db');
const SUBMISSION_TOKEN = process.env.SUBMISSION_TOKEN; // optional

if (!EMAIL_USER || !EMAIL_PASS || !RESEARCH_EMAIL) {
  console.warn('[WARN] EMAIL_USER/EMAIL_PASS/RESEARCH_EMAIL no configurados. El envío de emails fallará.');
}

// --- Ensure data dir exists ---
const dataDir = path.dirname(DB_PATH);
if (dataDir && dataDir !== '.' && !fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// --- DB init (SQLite with unique constraint) ---
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS responses (
    participant_id TEXT PRIMARY KEY,
    response TEXT NOT NULL CHECK (response IN ('acepto','necesito_mas_info','rechazo')),
    ts_utc TEXT NOT NULL,
    ip TEXT,
    user_agent TEXT
  );
`);

const insertStmt = db.prepare(
  `INSERT INTO responses (participant_id, response, ts_utc, ip, user_agent)
   VALUES (@participant_id, @response, @ts_utc, @ip, @user_agent)`
);
const getStmt = db.prepare(`SELECT * FROM responses WHERE participant_id = ?`);

// --- Security ---
app.disable('x-powered-by');
app.use(helmet());

// Strict CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.length === 0) return cb(null, true);
    return allowedOrigins.includes(origin) ? cb(null, true) : cb(new Error('Not allowed by CORS'));
  },
  methods: ['GET','POST'],
  credentials: false
}));

// Rate limiting (10 req/15 min per IP)
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false
}));

app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Static UI
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// --- Mailer ---
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: EMAIL_USER, pass: EMAIL_PASS }
});

async function sendNotification({ participantId, response, ts }) {
  if (!EMAIL_USER || !EMAIL_PASS || !RESEARCH_EMAIL) return;

  const subjects = {
    acepto: `✅ ACEPTACIÓN - Participante ${participantId} - Estudio Priónico`,
    necesito_mas_info: `ℹ️ SOLICITUD INFO - Participante ${participantId} - Estudio Priónico`,
    rechazo: `❌ NO PARTICIPACIÓN - Participante ${participantId} - Estudio Priónico`
  };

  const priorities = {
    acepto: 'Alta (contacto en 3–5 días)',
    necesito_mas_info: 'Media (programar sesión informativa)',
    rechazo: 'Baja (solo registro y confirmación)'
  };

  const nextSteps = {
    acepto: `<ol><li>Registrar en hoja de ruta.</li><li>Contactar en 3–5 días.</li><li>Enviar consentimiento e info.</li></ol>`,
    necesito_mas_info: `<ol><li>Enviar folleto y FAQs.</li><li>Ofrecer videollamada informativa.</li></ol>`,
    rechazo: `<p>Registrar decisión y enviar agradecimiento respetuoso.</p>`
  };

  const html = `
    <p><strong>Respuesta recibida</strong> para el participante <strong>${participantId}</strong>.</p>
    <ul>
      <li><strong>Tipo:</strong> ${response}</li>
      <li><strong>Timestamp (UTC):</strong> ${ts}</li>
      <li><strong>Prioridad:</strong> ${priorities[response]}</li>
    </ul>
    <h3>Próximos pasos sugeridos</h3>
    ${nextSteps[response]}
    <hr />
    <p>Este email se envió automáticamente desde el sistema de respuestas.</p>
  `;

  await transporter.sendMail({
    from: `Prion Study System <${EMAIL_USER}>`,
    to: RESEARCH_EMAIL,
    subject: subjects[response],
    html
  });
}

// --- Validators ---
const VALID_RESPONSES = new Set(['acepto','necesito_mas_info','rechazo']);
const idRegex = /^[A-Za-z0-9_\-:.]{3,128}$/;

function validatePayload({ response, id, token }) {
  if (!response || !VALID_RESPONSES.has(response)) {
    return 'Parámetro "response" inválido (use: acepto | necesito_mas_info | rechazo).';
  }
  if (!id || !idRegex.test(id)) {
    return 'Parámetro "id" inválido (alfanumérico, _ - : . , 3–128 chars).';
  }
  if (SUBMISSION_TOKEN && token !== SUBMISSION_TOKEN) {
    return 'Token de envío inválido.';
  }
  return null;
}

// --- API ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// POST submit
app.post('/api/submit', async (req, res) => {
  const { response, id, token } = req.body || {};
  const err = validatePayload({ response, id, token });
  if (err) return res.status(400).json({ ok: false, error: err });

  const existing = getStmt.get(id);
  if (existing) return res.status(409).json({ ok: false, error: 'Ya existe una respuesta para este participante' });

  const ts = new Date().toISOString();
  const record = {
    participant_id: id,
    response,
    ts_utc: ts,
    ip: req.ip,
    user_agent: req.get('user-agent') || null
  };

  try {
    insertStmt.run(record);
  } catch (e) {
    if (e && e.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      return res.status(409).json({ ok: false, error: 'Ya existe una respuesta para este participante' });
    }
    console.error('DB insert error:', e);
    return res.status(500).json({ ok: false, error: 'Error de servidor' });
  }

  try {
    await sendNotification({ participantId: id, response, ts });
  } catch (e) {
    console.error('Email error:', e);
  }

  res.json({ ok: true, message: 'Respuesta registrada', ts });
});

// GET submit (para enlaces directos)
app.get('/api/submit', async (req, res) => {
  const { response, id, token } = req.query || {};
  const err = validatePayload({ response, id, token });
  if (err) return res.status(400).json({ ok: false, error: err });

  const existing = getStmt.get(id);
  if (existing) return res.status(409).json({ ok: false, error: 'Ya existe una respuesta para este participante' });

  const ts = new Date().toISOString();
  const record = {
    participant_id: id,
    response,
    ts_utc: ts,
    ip: req.ip,
    user_agent: req.get('user-agent') || null
  };

  try {
    insertStmt.run(record);
  } catch (e) {
    if (e && e.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
      return res.status(409).json({ ok: false, error: 'Ya existe una respuesta para este participante' });
    }
    console.error('DB insert error:', e);
    return res.status(500).json({ ok: false, error: 'Error de servidor' });
  }

  try {
    await sendNotification({ participantId: id, response, ts });
  } catch (e) {
    console.error('Email error:', e);
  }

  const target = `/response.html?status=ok&response=${encodeURIComponent(response)}`;
  res.redirect(target);
});

// CORS error handler
app.use((err, req, res, next) => {
  if (err && err.message && err.message.includes('CORS')) {
    return res.status(403).json({ ok: false, error: 'Access to fetch blocked by CORS policy' });
  }
  return next(err);
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`[PrionStudy] listening on port ${PORT} env=${NODE_ENV}`);
});
