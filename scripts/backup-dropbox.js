/**
 * Script para crear backup en Dropbox manualmente
 * Uso: npm run backup:dropbox
 */

import Database from 'better-sqlite3';
import path from 'path';
import dotenv from 'dotenv';
import {
  checkDropboxConfig,
  exportCSVToDropbox,
  backupDatabaseToDropbox
} from '../services/backup-service.js';

// Cargar variables de entorno
dotenv.config();

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'data.db');

console.log('🔄 Iniciando backup a Dropbox...\n');

// Verificar configuración
const config = checkDropboxConfig();
console.log(`📋 Estado de Dropbox: ${config.message}\n`);

if (!config.configured) {
  console.error('❌ Error: Dropbox no está configurado');
  console.error('   Configura DROPBOX_ACCESS_TOKEN en el archivo .env\n');
  process.exit(1);
}

// Abrir base de datos
const db = new Database(DB_PATH, { readonly: true });

// Exportar CSV
console.log('📤 1/2: Exportando CSV a Dropbox...');
const csvResult = await exportCSVToDropbox(db);

if (csvResult.success) {
  console.log('✅ CSV exportado exitosamente');
  console.log(`   📁 Path: ${csvResult.dropboxPath}`);
  console.log(`   📊 Registros: ${csvResult.recordCount}`);
  console.log(`   💾 Tamaño: ${(csvResult.size / 1024).toFixed(2)} KB\n`);
} else {
  console.error('❌ Error exportando CSV:', csvResult.error, '\n');
}

// Backup de base de datos
console.log('💾 2/2: Subiendo base de datos completa a Dropbox...');
const dbResult = await backupDatabaseToDropbox();

if (dbResult.success) {
  console.log('✅ Base de datos subida exitosamente');
  console.log(`   📁 Path: ${dbResult.dropboxPath}`);
  console.log(`   💾 Tamaño: ${(dbResult.size / 1024).toFixed(2)} KB\n`);
} else {
  console.error('❌ Error subiendo base de datos:', dbResult.error, '\n');
}

// Cerrar base de datos
db.close();

if (csvResult.success && dbResult.success) {
  console.log('✅ Backup a Dropbox completado exitosamente\n');
  process.exit(0);
} else {
  console.error('⚠️  Backup completado con errores\n');
  process.exit(1);
}
