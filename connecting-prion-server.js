import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';

// Import services
import {
  readCSV,
  searchIndividuals,
  sortIndividuals,
  loadCredentials,
  authenticateUser
} from './services/csvService.js';
import {
  getAllTranslations,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE
} from './services/i18nService.js';

// Load environment variables
dotenv.config();

// ES module dirname workaround
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// In-memory data cache
let individualsCache = [];
let credentialsCache = [];

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      connectSrc: ["'self'"]
    }
  }
}));

app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
});
app.use('/api/', limiter);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// Load data from CSV files
async function loadData() {
  try {
    const individualsPath = process.env.INDIVIDUALS_CSV || './data/individuals.csv';
    const credentialsPath = process.env.CREDENTIALS_CSV || './data/credentials.csv';

    if (fs.existsSync(individualsPath)) {
      individualsCache = await readCSV(individualsPath);
      console.log(`Loaded ${individualsCache.length} individuals from CSV`);
    }

    if (fs.existsSync(credentialsPath)) {
      credentialsCache = await loadCredentials(credentialsPath);
      console.log(`Loaded ${credentialsCache.length} credentials from CSV`);
    }
  } catch (error) {
    console.error('Error loading data:', error.message);
  }
}

// API Routes

// Login endpoint
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = authenticateUser(credentialsCache, username, password);

    if (user) {
      req.session.user = user;
      res.json({
        success: true,
        user: {
          id_credentials: user.id_credentials,
          user: user.user,
          lang: user.lang,
          gender: user.gender,
          full_name: user.full_name,
          role: user.role
        }
      });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Error logging out' });
    }
    res.json({ success: true });
  });
});

// Get current user
app.get('/api/user', requireAuth, (req, res) => {
  res.json({ user: req.session.user });
});

// Get all individuals
app.get('/api/individuals', requireAuth, (req, res) => {
  try {
    const { search, sortBy, sortDir } = req.query;

    let results = [...individualsCache];

    // Apply search filter
    if (search) {
      results = searchIndividuals(results, search);
    }

    // Apply sorting
    if (sortBy) {
      results = sortIndividuals(results, sortBy, sortDir || 'asc');
    }

    res.json({
      success: true,
      data: results,
      total: results.length
    });
  } catch (error) {
    console.error('Error fetching individuals:', error);
    res.status(500).json({ error: 'Error fetching data' });
  }
});

// Get individual by ID
app.get('/api/individuals/:id', requireAuth, (req, res) => {
  try {
    const individual = individualsCache.find(
      ind => ind.id === req.params.id || ind.id_osakidetza === req.params.id
    );

    if (individual) {
      res.json({ success: true, data: individual });
    } else {
      res.status(404).json({ error: 'Individual not found' });
    }
  } catch (error) {
    console.error('Error fetching individual:', error);
    res.status(500).json({ error: 'Error fetching data' });
  }
});

// Get translations
app.get('/api/translations', (req, res) => {
  try {
    const translations = getAllTranslations();
    res.json({ success: true, translations });
  } catch (error) {
    console.error('Error fetching translations:', error);
    res.status(500).json({ error: 'Error fetching translations' });
  }
});

// Get supported languages
app.get('/api/languages', (req, res) => {
  res.json({
    success: true,
    languages: SUPPORTED_LANGUAGES,
    default: DEFAULT_LANGUAGE
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    individuals: individualsCache.length,
    credentials: credentialsCache.length
  });
});

// Serve index.html for all other routes (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
async function startServer() {
  try {
    // Load data from CSV files
    await loadData();

    app.listen(PORT, () => {
      console.log(`\n🚀 Server running on port ${PORT}`);
      console.log(`📊 Loaded ${individualsCache.length} individuals`);
      console.log(`👥 Loaded ${credentialsCache.length} users`);
      console.log(`🌍 Supported languages: ${SUPPORTED_LANGUAGES.join(', ')}`);
      console.log(`\n💻 Access the application at: http://localhost:${PORT}\n`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start the server
startServer();
