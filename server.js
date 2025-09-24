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


// Prepared statements
const insertStmt = db.prepare(`INSERT INTO responses (participant_id, response, ts_utc, ip, user_agent)
VALUES (@participant_id, @response, @ts_utc, @ip, @user_agent)`);
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
if (!origin || allowedOrigins.length === 0) return cb(null, true); // allow same-origin / tools, or allow all if none configured
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
});
