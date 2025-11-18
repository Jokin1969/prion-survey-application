import express from 'express';
import session from 'express-session';
import connectSqlite3 from 'connect-sqlite3';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';
import multer from 'multer';

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
import {
  uploadToDropbox,
  checkDocumentInDropbox,
  deleteFromDropbox,
  ensureDropboxFolder
} from './services/dropboxService.js';
import { syncCSVFromDropbox } from './services/csvSync.js';

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

// CORS configuration
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(morgan('combined'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration with SQLite store
const SQLiteStore = connectSqlite3(session);
app.use(session({
  store: new SQLiteStore({
    db: 'sessions.db',
    dir: './data'
  }),
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to false for now to test
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax'
  }
}));

// Rate limiting - only for login endpoint to prevent brute force
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login requests per windowMs
  message: { error: 'Too many login attempts, please try again later' }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded documents
app.use('/documents', express.static(path.join(__dirname, 'uploads/documents')));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads/documents');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Use the id_ci from the request
    const idCi = req.body.id_ci || req.params.id_ci;
    const ext = path.extname(file.originalname);
    cb(null, `${idCi}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|jpg|jpeg|png|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, images, and documents are allowed'));
    }
  }
});

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}

// Load data from CSV files
async function loadData(listNumber = 1) {
  try {
    // Determine which individuals CSV to load based on list number
    const individualsFileName = `${listNumber}_individuals.csv`;
    const individualsPath = process.env.INDIVIDUALS_CSV || `./data/${individualsFileName}`;
    const credentialsPath = process.env.CREDENTIALS_CSV || './data/credentials.csv';

    if (fs.existsSync(individualsPath)) {
      individualsCache = await readCSV(individualsPath);
      console.log(`Loaded ${individualsCache.length} individuals from ${individualsFileName}`);
    } else {
      // Fallback to default individuals.csv if specific list file doesn't exist
      const fallbackPath = './data/1_individuals.csv';
      if (fs.existsSync(fallbackPath)) {
        individualsCache = await readCSV(fallbackPath);
        console.log(`Loaded ${individualsCache.length} individuals from fallback (1_individuals.csv)`);
      }
    }

    if (fs.existsSync(credentialsPath)) {
      credentialsCache = await loadCredentials(credentialsPath);
      console.log(`Loaded ${credentialsCache.length} credentials from CSV`);
    }
  } catch (error) {
    console.error('Error loading data:', error.message);
  }
}

// Helper function to load individuals data for a specific list
async function loadIndividualsForList(listNumber) {
  try {
    const individualsFileName = `${listNumber}_individuals.csv`;
    const individualsPath = `./data/${individualsFileName}`;

    if (fs.existsSync(individualsPath)) {
      const data = await readCSV(individualsPath);
      console.log(`Loaded ${data.length} individuals from ${individualsFileName} for user`);
      return data;
    } else {
      // Fallback to list 1 if specific file doesn't exist
      const fallbackPath = './data/1_individuals.csv';
      if (fs.existsSync(fallbackPath)) {
        const data = await readCSV(fallbackPath);
        console.log(`Loaded ${data.length} individuals from fallback (1_individuals.csv)`);
        return data;
      }
    }
    return [];
  } catch (error) {
    console.error('Error loading individuals for list:', error.message);
    return [];
  }
}

// API Routes

// Login endpoint
app.post('/api/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    console.log(`Login attempt - Username: ${username}, Credentials loaded: ${credentialsCache.length}`);

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = authenticateUser(credentialsCache, username, password);

    if (user) {
      console.log(`Login successful for user: ${username}`);
      req.session.user = user;
      res.json({
        success: true,
        user: {
          id_credentials: user.id_credentials,
          user: user.user,
          lang: user.lang,
          gender: user.gender,
          name: user.name,
          last_names: user.last_names,
          full_name: user.full_name,
          role: user.role,
          list: user.list || '1' // Default to list 1 if not specified
        }
      });
    } else {
      console.log(`Login failed for user: ${username} - Invalid credentials`);
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
app.get('/api/individuals', requireAuth, async (req, res) => {
  try {
    const { search, sortBy, sortDir } = req.query;

    // Determine which CSV to load based on user's list value
    const userList = req.session.user.list || '1';
    const listNumber = parseInt(userList, 10);

    // Load the appropriate individuals CSV for this user
    let results = await loadIndividualsForList(listNumber);

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
app.get('/api/individuals/:id', requireAuth, async (req, res) => {
  try {
    // Determine which CSV to load based on user's list value
    const userList = req.session.user.list || '1';
    const listNumber = parseInt(userList, 10);

    // Load the appropriate individuals CSV for this user
    const individuals = await loadIndividualsForList(listNumber);

    const individual = individuals.find(
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

// Upload document for individual
app.post('/api/upload-document', requireAuth, upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { id_osakidetza } = req.body;
    if (!id_osakidetza) {
      return res.status(400).json({ error: 'id_osakidetza is required' });
    }

    const localFilePath = req.file.path;

    // Upload to Dropbox
    try {
      const dropboxResult = await uploadToDropbox(localFilePath, id_osakidetza);

      // Optionally delete local file after successful upload
      fs.unlinkSync(localFilePath);

      res.json({
        success: true,
        filename: req.file.filename,
        url: dropboxResult.shareUrl,
        dropboxPath: dropboxResult.dropboxPath,
        message: 'Document uploaded successfully to Dropbox'
      });
    } catch (dropboxError) {
      console.error('Error uploading to Dropbox:', dropboxError);

      // Fallback to local storage if Dropbox fails
      const fileUrl = `/documents/${req.file.filename}`;
      res.json({
        success: true,
        filename: req.file.filename,
        url: fileUrl,
        message: 'Document uploaded locally (Dropbox unavailable)',
        warning: 'Dropbox upload failed - file stored locally only'
      });
    }
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ error: 'Error uploading document' });
  }
});

// Delete document
app.delete('/api/delete-document/:id_osakidetza', requireAuth, async (req, res) => {
  try {
    const { id_osakidetza } = req.params;
    let deletedFromDropbox = false;
    let deletedFromLocal = false;

    // Try to delete from Dropbox first
    try {
      await deleteFromDropbox(id_osakidetza);
      deletedFromDropbox = true;
    } catch (dropboxError) {
      console.warn('Error deleting from Dropbox:', dropboxError.message);
    }

    // Also try to delete from local storage
    const uploadsDir = path.join(__dirname, 'uploads/documents');
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      const fileToDelete = files.find(file => {
        const nameWithoutExt = path.parse(file).name;
        return nameWithoutExt === id_osakidetza;
      });

      if (fileToDelete) {
        const filePath = path.join(uploadsDir, fileToDelete);
        fs.unlinkSync(filePath);
        deletedFromLocal = true;
      }
    }

    if (!deletedFromDropbox && !deletedFromLocal) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json({
      success: true,
      message: 'Document deleted successfully',
      deletedFrom: deletedFromDropbox ? (deletedFromLocal ? 'both' : 'dropbox') : 'local'
    });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Error deleting document' });
  }
});

// Check if document exists for id_osakidetza
app.get('/api/check-document/:id_osakidetza', requireAuth, async (req, res) => {
  try {
    const { id_osakidetza } = req.params;

    // Check in Dropbox first
    try {
      const dropboxResult = await checkDocumentInDropbox(id_osakidetza);

      if (dropboxResult.exists) {
        return res.json({
          success: true,
          exists: true,
          filename: dropboxResult.filename,
          url: dropboxResult.shareUrl,
          source: 'dropbox'
        });
      }
    } catch (dropboxError) {
      console.warn('Error checking Dropbox, falling back to local:', dropboxError.message);
    }

    // Fallback to local storage
    const uploadsDir = path.join(__dirname, 'uploads/documents');

    if (!fs.existsSync(uploadsDir)) {
      return res.json({ success: true, exists: false });
    }

    const files = fs.readdirSync(uploadsDir);
    const file = files.find(f => {
      const nameWithoutExt = path.parse(f).name;
      return nameWithoutExt === id_osakidetza;
    });

    if (file) {
      res.json({
        success: true,
        exists: true,
        filename: file,
        url: `/documents/${file}`,
        source: 'local'
      });
    } else {
      res.json({
        success: true,
        exists: false
      });
    }
  } catch (error) {
    console.error('Error checking document:', error);
    res.status(500).json({ error: 'Error checking document' });
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
    // Sync CSV files from Dropbox (if configured)
    console.log('\n🔄 Initializing CSV data...');
    await syncCSVFromDropbox();

    // Load data from CSV files
    await loadData();

    // Initialize Dropbox folder for documents
    await ensureDropboxFolder();

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
