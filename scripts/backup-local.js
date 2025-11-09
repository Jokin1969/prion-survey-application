/**
 * Script para crear backup local manualmente
 * Uso: npm run backup:local
 */

import { createLocalBackup, cleanOldBackups } from '../services/backup-service.js';

console.log('🔄 Iniciando backup local...\n');

// Crear backup
const result = await createLocalBackup();

if (result.success) {
  console.log('✅ Backup local creado exitosamente');
  console.log(`   📁 Archivo: ${result.fileName}`);
  console.log(`   📊 Tamaño: ${(result.size / 1024).toFixed(2)} KB`);
  console.log(`   🕐 Timestamp: ${result.timestamp}\n`);
} else {
  console.error('❌ Error creando backup local:', result.error);
  process.exit(1);
}

// Limpiar backups antiguos
console.log('🧹 Limpiando backups antiguos...');
const cleanup = await cleanOldBackups(7);

if (cleanup.success) {
  console.log(`✅ Limpieza completada`);
  console.log(`   🗑️  Eliminados: ${cleanup.deleted}`);
  console.log(`   📦 Conservados: ${cleanup.kept}`);
  console.log(`   ⏰ Retención: ${cleanup.retentionDays} días\n`);
} else {
  console.error('⚠️  Error en limpieza:', cleanup.error);
}

console.log('✅ Proceso completado\n');
