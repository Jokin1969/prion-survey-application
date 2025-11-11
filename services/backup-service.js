/**
 * Servicio de Backups - ActPrion Project
 *
 * Sistema de backups en 3 capas:
 * 1. Backups locales en Railway (retention 7 días)
 * 2. Exportación CSV diaria a Dropbox
 * 3. Backup completo .db semanal a Dropbox
 */

import fs from 'fs';
import path from 'path';
import { Dropbox } from 'dropbox';

// Configuración
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'data.db');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const DROPBOX_ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;

// Inicializar Dropbox si hay token configurado
let dbx = null;
if (DROPBOX_ACCESS_TOKEN) {
  dbx = new Dropbox({ accessToken: DROPBOX_ACCESS_TOKEN });
}

/**
 * Crear directorio de backups si no existe
 */
function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

/**
 * CAPA 1: Backup local en Railway
 * Guarda una copia de la base de datos en /data/backups/
 *
 * @returns {Object} Información del backup creado
 */
export async function createLocalBackup() {
  try {
    ensureBackupDir();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const backupFileName = `data_${timestamp}.db`;
    const backupPath = path.join(BACKUP_DIR, backupFileName);

    // Copiar base de datos
    fs.copyFileSync(DB_PATH, backupPath);

    const stats = fs.statSync(backupPath);

    return {
      success: true,
      path: backupPath,
      fileName: backupFileName,
      size: stats.size,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error creating local backup:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Limpiar backups locales antiguos
 * Mantiene solo los últimos N días
 *
 * @param {number} retentionDays - Días de retención (default: 7)
 * @returns {Object} Resultado de la limpieza
 */
export async function cleanOldBackups(retentionDays = 7) {
  try {
    ensureBackupDir();

    const now = Date.now();
    const maxAge = retentionDays * 24 * 60 * 60 * 1000; // días a milisegundos

    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('data_') && f.endsWith('.db'));

    let deleted = 0;
    let kept = 0;

    for (const file of files) {
      const filePath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(filePath);
      const age = now - stats.mtimeMs;

      if (age > maxAge) {
        fs.unlinkSync(filePath);
        deleted++;
      } else {
        kept++;
      }
    }

    return {
      success: true,
      deleted,
      kept,
      retentionDays
    };
  } catch (error) {
    console.error('Error cleaning old backups:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * CAPA 2: Exportar CSV a Dropbox
 * Exporta las respuestas en formato CSV y las sube a Dropbox
 *
 * @param {Object} db - Instancia de la base de datos
 * @returns {Object} Resultado de la exportación
 */
export async function exportCSVToDropbox(db) {
  try {
    if (!dbx) {
      throw new Error('Dropbox no configurado. Falta DROPBOX_ACCESS_TOKEN');
    }

    // Obtener todas las respuestas
    const responses = db.prepare(`
      SELECT participant_id, question_id, answer, ts_utc
      FROM questionnaire_answers
      ORDER BY participant_id, question_id
    `).all();

    // Organizar por participante
    const responsesByParticipant = {};
    responses.forEach(row => {
      if (!responsesByParticipant[row.participant_id]) {
        responsesByParticipant[row.participant_id] = {};
      }
      responsesByParticipant[row.participant_id][row.question_id] = row.answer;
    });

    // Lista de preguntas
    const allQuestions = [
      'P0A', 'P0B', 'P0C', 'P01', 'P02A', 'P02', 'P03', 'P04', 'P05', 'P06',
      'P07', 'P08', 'P09_phase1', 'P09_phase2', 'P09_phase3', 'P09_preference',
      'P10', 'P11', 'P12', 'P13', 'P14', 'P15', 'P16', 'P17', 'P18', 'P19',
      'P20', 'P21', 'P22a', 'P22b', 'P23', 'P24', 'P25', 'P26'
    ];

    // Construir CSV
    const csvHeaders = ['participant_id', ...allQuestions];
    let csvContent = csvHeaders.join(',') + '\n';

    for (const [participantId, answers] of Object.entries(responsesByParticipant)) {
      const row = [participantId];

      for (const question of allQuestions) {
        const answer = answers[question] || '';
        // Escapar comillas y comas
        const escaped = String(answer).replace(/"/g, '""');
        row.push(`"${escaped}"`);
      }

      csvContent += row.join(',') + '\n';
    }

    // Subir a Dropbox
    const timestamp = new Date().toISOString().split('T')[0];
    const dropboxPath = `/ActPrion/backups/csv/actprion_responses_${timestamp}.csv`;

    const result = await dbx.filesUpload({
      path: dropboxPath,
      contents: Buffer.from('\ufeff' + csvContent, 'utf8'), // BOM para UTF-8
      mode: 'add',
      autorename: true
    });

    return {
      success: true,
      dropboxPath: result.result.path_display,
      size: result.result.size,
      recordCount: Object.keys(responsesByParticipant).length,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error exporting CSV to Dropbox:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * CAPA 3: Backup completo de base de datos a Dropbox
 * Sube la base de datos completa (.db) a Dropbox
 *
 * @returns {Object} Resultado del backup
 */
export async function backupDatabaseToDropbox() {
  try {
    if (!dbx) {
      throw new Error('Dropbox no configurado. Falta DROPBOX_ACCESS_TOKEN');
    }

    // Leer base de datos
    const dbContent = fs.readFileSync(DB_PATH);

    // Subir a Dropbox
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dropboxPath = `/ActPrion/backups/database/actprion_${timestamp}.db`;

    const result = await dbx.filesUpload({
      path: dropboxPath,
      contents: dbContent,
      mode: 'add',
      autorename: true
    });

    return {
      success: true,
      dropboxPath: result.result.path_display,
      size: result.result.size,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error backing up database to Dropbox:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Listar backups disponibles en Dropbox
 *
 * @param {string} folder - Carpeta a listar ('csv' o 'database')
 * @returns {Object} Lista de backups
 */
export async function listDropboxBackups(folder = 'database') {
  try {
    if (!dbx) {
      throw new Error('Dropbox no configurado. Falta DROPBOX_ACCESS_TOKEN');
    }

    const dropboxPath = `/ActPrion/backups/${folder}`;

    const result = await dbx.filesListFolder({ path: dropboxPath });

    const files = result.result.entries.map(entry => ({
      name: entry.name,
      path: entry.path_display,
      size: entry.size,
      modified: entry.client_modified
    }));

    return {
      success: true,
      files,
      count: files.length
    };
  } catch (error) {
    console.error('Error listing Dropbox backups:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Sistema completo de backup (ejecuta las 3 capas)
 *
 * @param {Object} db - Instancia de la base de datos
 * @returns {Object} Resultado de todos los backups
 */
export async function fullBackup(db) {
  const results = {
    timestamp: new Date().toISOString(),
    layers: {}
  };

  // Capa 1: Backup local
  console.log('📦 Capa 1: Creando backup local...');
  results.layers.local = await createLocalBackup();

  // Capa 2: CSV a Dropbox (solo si Dropbox está configurado)
  if (dbx) {
    console.log('📤 Capa 2: Exportando CSV a Dropbox...');
    results.layers.csvDropbox = await exportCSVToDropbox(db);
  }

  // Capa 3: Base de datos a Dropbox (solo si Dropbox está configurado)
  if (dbx) {
    console.log('💾 Capa 3: Subiendo base de datos a Dropbox...');
    results.layers.databaseDropbox = await backupDatabaseToDropbox();
  }

  // Limpieza de backups antiguos
  console.log('🧹 Limpiando backups antiguos...');
  results.cleanup = await cleanOldBackups(7);

  console.log('✅ Backup completo finalizado');

  return results;
}

/**
 * Verificar configuración de Dropbox
 *
 * @returns {Object} Estado de la configuración
 */
export function checkDropboxConfig() {
  return {
    configured: !!dbx,
    hasToken: !!DROPBOX_ACCESS_TOKEN,
    message: dbx
      ? 'Dropbox configurado correctamente'
      : 'Dropbox no configurado. Configura DROPBOX_ACCESS_TOKEN en las variables de entorno'
  };
}

/**
 * Validar token de Dropbox haciendo una llamada real a la API
 * Intenta obtener información de la cuenta para verificar que el token funciona
 *
 * @returns {Object} Resultado de la validación
 */
export async function validateDropboxToken() {
  try {
    if (!dbx) {
      return {
        valid: false,
        error: 'Dropbox no configurado. Falta DROPBOX_ACCESS_TOKEN',
        needsAction: 'Configura DROPBOX_ACCESS_TOKEN en las variables de entorno de Railway'
      };
    }

    // Intentar obtener información de la cuenta
    const accountInfo = await dbx.usersGetCurrentAccount();

    return {
      valid: true,
      message: 'Token válido y funcionando correctamente',
      account: {
        name: accountInfo.result.name.display_name,
        email: accountInfo.result.email,
        accountId: accountInfo.result.account_id
      }
    };
  } catch (error) {
    // Analizar el tipo de error
    let needsAction = 'Regenerar token de Dropbox';
    let errorDetails = error.message;

    if (error.status === 401) {
      errorDetails = 'Token expirado, revocado o inválido';
      needsAction = 'Regenerar token en https://www.dropbox.com/developers/apps y actualizar DROPBOX_ACCESS_TOKEN en Railway';
    } else if (error.status === 429) {
      errorDetails = 'Rate limit excedido';
      needsAction = 'Esperar unos minutos e intentar nuevamente';
    } else if (error.error && error.error.error_summary) {
      errorDetails = error.error.error_summary;
    }

    return {
      valid: false,
      error: errorDetails,
      errorCode: error.status || 'unknown',
      needsAction
    };
  }
}

/**
 * IMPORTACIÓN: Descargar participantes.csv desde Dropbox
 * Descarga el archivo desde /ActPrion/Databases/participantes.csv
 *
 * @returns {Object} Resultado de la descarga
 */
export async function downloadParticipantsFromDropbox() {
  try {
    if (!dbx) {
      throw new Error('Dropbox no configurado. Falta DROPBOX_ACCESS_TOKEN');
    }

    const dropboxPath = '/ActPrion/Databases/participantes.csv';

    // Descargar archivo desde Dropbox
    const response = await dbx.filesDownload({ path: dropboxPath });

    if (!response || !response.result || !response.result.fileBinary) {
      throw new Error('No se pudo descargar el archivo desde Dropbox');
    }

    // Guardar en /data/participantes.csv
    const localPath = path.join(DATA_DIR, 'participantes.csv');
    fs.writeFileSync(localPath, response.result.fileBinary);

    const stats = fs.statSync(localPath);

    return {
      success: true,
      localPath,
      dropboxPath,
      size: stats.size,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error downloading participants from Dropbox:', error);

    // Mensaje más específico si el archivo no existe
    if (error.error && error.error.error_summary && error.error.error_summary.includes('not_found')) {
      return {
        success: false,
        error: 'Archivo no encontrado en Dropbox. Asegúrate de subir participantes.csv a /ActPrion/Databases/'
      };
    }

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * IMPORTACIÓN: Importar participantes desde Dropbox
 * Descarga y valida el archivo participantes.csv desde Dropbox
 * El CSV puede tener cualquier número de campos, solo valida que existan los mínimos requeridos
 *
 * @returns {Object} Resultado de la importación
 */
export async function importParticipantsFromDropbox() {
  try {
    // Descargar desde Dropbox
    const downloadResult = await downloadParticipantsFromDropbox();

    if (!downloadResult.success) {
      return downloadResult;
    }

    // Validar formato del CSV
    const csvContent = fs.readFileSync(downloadResult.localPath, 'utf8');
    const lines = csvContent.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      return {
        success: false,
        error: 'El archivo CSV está vacío o no contiene datos'
      };
    }

    // Obtener todos los headers del CSV (preserva mayúsculas/minúsculas originales)
    const headersRaw = lines[0].split(',').map(h => h.trim().replace(/^"*|"*$/g, ''));

    // Validar que existan los campos mínimos requeridos (case-insensitive)
    const headersLower = headersRaw.map(h => h.toLowerCase());
    const requiredHeaders = ['id', 'name', 'email', 'lang'];
    const missingHeaders = requiredHeaders.filter(h => !headersLower.includes(h));

    if (missingHeaders.length > 0) {
      return {
        success: false,
        error: `Faltan columnas requeridas en el CSV: ${missingHeaders.join(', ')}`
      };
    }

    // Contar participantes (excluyendo header)
    const participantCount = lines.length - 1;

    return {
      success: true,
      message: 'Participantes importados exitosamente',
      localPath: downloadResult.localPath,
      dropboxPath: downloadResult.dropboxPath,
      participantCount,
      totalFields: headersRaw.length,
      fields: headersRaw, // Todos los campos del CSV
      size: downloadResult.size,
      timestamp: downloadResult.timestamp
    };
  } catch (error) {
    console.error('Error importing participants:', error);
    return {
      success: false,
      error: error.message
    };
  }
}
