# Sistema de Backups - ActPrion Project

## 📋 Descripción General

Sistema completo de backups en 3 capas para proteger los datos del proyecto ActPrion.

```
┌─────────────────────────────────────────┐
│  Capa 1: Backups locales en Railway    │
│  • Automático cada 24h (2:00 AM)       │
│  • Retención: 7 días                   │
│  • Ubicación: /data/backups/           │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  Capa 2: CSV diario a Dropbox          │
│  • Automático cada 24h (3:00 AM)       │
│  • Formato legible (CSV)               │
│  • Ubicación: /backups/csv/            │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  Capa 3: DB completa semanal           │
│  • Automático domingos (4:00 AM)       │
│  • Base de datos completa (.db)        │
│  • Ubicación: /backups/database/       │
└─────────────────────────────────────────┘
```

---

## 🔧 Configuración

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar Dropbox (opcional pero recomendado)

#### ⚠️ IMPORTANTE: Sistema de Refresh Token

Dropbox usa **tokens de corta duración** que expiran en pocas horas. Por eso, el sistema ahora usa **refresh tokens** que permiten renovar automáticamente el access token sin intervención manual.

**📖 Para obtener las credenciales completas, sigue la guía detallada:**
[→ Ver DROPBOX_REFRESH_TOKEN.md](./DROPBOX_REFRESH_TOKEN.md)

#### Resumen de configuración:

Necesitas 3 variables de entorno:

1. `DROPBOX_REFRESH_TOKEN` - Token que nunca expira y permite obtener nuevos access tokens
2. `DROPBOX_APP_KEY` - ID de tu app en Dropbox
3. `DROPBOX_APP_SECRET` - Secreto de tu app en Dropbox

#### Añadir variables a Railway:

**Opción A: Desde Railway Dashboard**
1. Ir a tu proyecto en Railway
2. Variables → Add Variable
3. Agregar las 3 variables:
   - `DROPBOX_REFRESH_TOKEN`
   - `DROPBOX_APP_KEY`
   - `DROPBOX_APP_SECRET`
4. Guardar

**Opción B: Desde Railway CLI**
```bash
railway variables set DROPBOX_REFRESH_TOKEN="tu-refresh-token"
railway variables set DROPBOX_APP_KEY="tu-app-key"
railway variables set DROPBOX_APP_SECRET="tu-app-secret"
```

#### Local (desarrollo):

Crear/editar archivo `.env`:
```bash
DROPBOX_REFRESH_TOKEN=tu-refresh-token-aquí
DROPBOX_APP_KEY=tu-app-key-aquí
DROPBOX_APP_SECRET=tu-app-secret-aquí
```

---

## 📦 Uso Manual

### Backup local

```bash
# Ejecutar backup local
npm run backup:local

# O directamente
node scripts/backup-local.js
```

**Resultado:**
- Crea `/data/backups/data_YYYY-MM-DD.db`
- Elimina backups > 7 días

### Backup a Dropbox

```bash
# Ejecutar backup completo a Dropbox
npm run backup:dropbox

# O directamente
node scripts/backup-dropbox.js
```

**Resultado:**
- CSV: `/backups/csv/actprion_responses_YYYY-MM-DD.csv`
- DB: `/backups/database/actprion_TIMESTAMP.db`

---

## 🌐 API Endpoints

### Verificar estado del sistema

```bash
GET /admin/backup/status
```

**Respuesta:**
```json
{
  "ok": true,
  "configured": true,
  "hasRefreshToken": true,
  "hasAppKey": true,
  "hasAppSecret": true,
  "message": "Dropbox configurado correctamente con refresh token",
  "backupLayers": {
    "layer1": "Backups locales en Railway (automático)",
    "layer2": "CSV a Dropbox (requiere configuración)",
    "layer3": "DB completa a Dropbox (requiere configuración)"
  }
}
```

### Validar token de Dropbox (diagnóstico)

```bash
GET /admin/backup/validate-token
```

Valida que las credenciales de Dropbox funcionen correctamente haciendo una llamada real a la API.

**Respuesta exitosa:**
```json
{
  "ok": true,
  "valid": true,
  "message": "Token válido y funcionando correctamente",
  "account": {
    "name": "Tu Nombre",
    "email": "tu@email.com",
    "accountId": "dbid:..."
  }
}
```

**Respuesta con error:**
```json
{
  "ok": false,
  "valid": false,
  "error": "Token expirado, revocado o inválido",
  "needsAction": "Regenerar refresh token en https://www.dropbox.com/developers/apps"
}
```

### Forzar renovación de token (testing)

```bash
POST /admin/backup/refresh-token
```

Fuerza la renovación del access token usando el refresh token. Útil para testing o diagnóstico.

**Respuesta:**
```json
{
  "ok": true,
  "success": true,
  "message": "Token renovado exitosamente",
  "expiresAt": "2025-11-12T14:30:00.000Z"
}
```

### Crear backup local

```bash
POST /admin/backup/local
```

**Respuesta:**
```json
{
  "ok": true,
  "message": "Backup local creado exitosamente",
  "path": "/data/backups/data_2025-11-09.db",
  "fileName": "data_2025-11-09.db",
  "size": 40960,
  "timestamp": "2025-11-09T02:00:00.000Z"
}
```

### Exportar CSV a Dropbox

```bash
POST /admin/backup/csv-dropbox
```

**Respuesta:**
```json
{
  "ok": true,
  "message": "CSV exportado a Dropbox exitosamente",
  "dropboxPath": "/backups/csv/actprion_responses_2025-11-09.csv",
  "size": 15234,
  "recordCount": 45
}
```

### Backup completo de DB a Dropbox

```bash
POST /admin/backup/db-dropbox
```

**Respuesta:**
```json
{
  "ok": true,
  "message": "Base de datos subida a Dropbox exitosamente",
  "dropboxPath": "/backups/database/actprion_2025-11-09T03-00-00.db",
  "size": 40960
}
```

### Backup completo (3 capas)

```bash
POST /admin/backup/full
```

Ejecuta las 3 capas secuencialmente.

### Limpiar backups antiguos

```bash
POST /admin/backup/cleanup?days=7
```

Elimina backups locales con más de N días.

### Listar backups en Dropbox

```bash
GET /admin/backup/list-dropbox?folder=database
```

**Parámetros:**
- `folder`: `database` o `csv`

**Respuesta:**
```json
{
  "ok": true,
  "files": [
    {
      "name": "actprion_2025-11-09.db",
      "path": "/backups/database/actprion_2025-11-09.db",
      "size": 40960,
      "modified": "2025-11-09T04:00:00Z"
    }
  ],
  "count": 1
}
```

---

## 🕐 Programación Automática

### Producción (Railway)

Los cron jobs se activan automáticamente cuando `NODE_ENV=production`:

| Capa | Frecuencia | Hora | Descripción |
|------|-----------|------|-------------|
| 1️⃣ Local | Diario | 2:00 AM | Backup en `/data/backups/` |
| 2️⃣ CSV | Diario | 3:00 AM | Exportar CSV a Dropbox |
| 3️⃣ DB | Semanal | 4:00 AM (Domingos) | DB completa a Dropbox |

**Zona horaria:** Europe/Madrid

### Desarrollo (Local)

Los cron jobs están desactivados en desarrollo para evitar backups innecesarios.

Para probar manualmente:
```bash
npm run backup:local
npm run backup:dropbox
```

---

## 📥 Restauración de Datos

### Desde backup local (Railway)

```bash
# Listar backups disponibles
railway run -- ls -lh data/backups/

# Restaurar backup específico
railway run -- cp data/backups/data_2025-11-09.db data/data.db

# O desde tu local
railway run -- cat data/backups/data_2025-11-09.db > data/data.db
```

### Desde Dropbox

1. **Descargar desde Dropbox web:**
   - Ir a `/backups/database/`
   - Descargar el archivo `.db` deseado

2. **Subir a Railway:**
```bash
# Con Railway CLI
cat backup_descargado.db | railway run -- sh -c "cat > data/data.db"
```

### Desde CSV (solo datos del cuestionario)

El CSV es útil para:
- Importar a Excel/Google Sheets
- Análisis estadístico
- Backup legible por humanos

**Nota:** El CSV solo contiene respuestas del cuestionario, no toda la base de datos.

---

## 🔒 Seguridad

### Protecciones implementadas

✅ `.gitignore` protege bases de datos locales
✅ `deploy.sh` verifica que no se suba `data.db` a Git
✅ Dropbox token en variables de entorno (no en código)
✅ Backups locales con retención limitada (7 días)

### Buenas prácticas

1. ✅ **Nunca** hacer commit de `data.db` o backups
2. ✅ **Siempre** usar `DROPBOX_ACCESS_TOKEN` desde variables de entorno
3. ✅ Verificar backups periódicamente
4. ✅ Probar restauración antes de necesitarla

---

## 🧪 Testing

### Probar backup local

```bash
# Ejecutar backup
npm run backup:local

# Verificar que se creó
ls -lh data/backups/
```

### Probar backup a Dropbox

```bash
# Verificar configuración
curl https://tu-app.railway.app/admin/backup/status

# Ejecutar backup manual
curl -X POST https://tu-app.railway.app/admin/backup/csv-dropbox

# Listar backups
curl https://tu-app.railway.app/admin/backup/list-dropbox?folder=csv
```

### Probar restauración

```bash
# 1. Hacer backup de la DB actual
cp data/data.db data/data_original.db

# 2. Restaurar desde backup
cp data/backups/data_2025-11-09.db data/data.db

# 3. Verificar que la app funciona
npm start

# 4. Si todo OK, eliminar el backup temporal
rm data/data_original.db
```

---

## 📊 Monitoreo

### Logs de Railway

```bash
# Ver logs en tiempo real
railway logs

# Buscar logs de cron
railway logs | grep CRON

# Ver últimos backups
railway logs | grep "Backup local creado"
```

### Verificar en Dropbox

1. Ir a https://www.dropbox.com
2. Navegar a `/backups/`
3. Verificar que existen carpetas:
   - `csv/` - Exportaciones diarias
   - `database/` - Backups semanales

---

## ❓ Troubleshooting

### "Dropbox no configurado"

**Problema:** Los endpoints de Dropbox devuelven error.

**Solución:**
1. Verificar que las 3 variables estén configuradas en Railway:
   - `DROPBOX_REFRESH_TOKEN`
   - `DROPBOX_APP_KEY`
   - `DROPBOX_APP_SECRET`
2. Verificar el estado en: `/admin/backup/status`
3. Validar las credenciales en: `/admin/backup/validate-token`

### "Token expirado, revocado o inválido"

**Problema:** El refresh token fue revocado o es inválido.

**Solución:**
1. Ir a [Dropbox App Console](https://www.dropbox.com/developers/apps)
2. Seguir la guía en [DROPBOX_REFRESH_TOKEN.md](./DROPBOX_REFRESH_TOKEN.md) para obtener un nuevo refresh token
3. Actualizar las variables en Railway:
   ```bash
   railway variables set DROPBOX_REFRESH_TOKEN="nuevo-refresh-token"
   railway variables set DROPBOX_APP_KEY="tu-app-key"
   railway variables set DROPBOX_APP_SECRET="tu-app-secret"
   ```

### Los backups no se guardan en Dropbox

**Problema:** Los backups programados no se suben a Dropbox.

**Solución:**
1. Verificar configuración: `GET /admin/backup/validate-token`
2. Ver logs de Railway: `railway logs | grep Dropbox`
3. Probar manualmente: `POST /admin/backup/csv-dropbox`
4. Verificar que el token se renueva automáticamente:
   - El sistema renueva el token automáticamente cada ~4 horas
   - Ver logs para confirmar: "🔄 Renovando token de Dropbox..."
   - Ver logs de éxito: "✅ Token renovado exitosamente"

### Backups no se ejecutan automáticamente

**Problema:** Los cron jobs no corren.

**Solución:**
1. Verificar que `NODE_ENV=production` en Railway
2. Ver logs: `railway logs | grep CRON`
3. Verificar zona horaria (Europe/Madrid)

### Espacio en disco lleno

**Problema:** Los backups locales ocupan mucho espacio.

**Solución:**
```bash
# Ejecutar limpieza manual
curl -X POST "https://tu-app.railway.app/admin/backup/cleanup?days=3"
```

---

## 📞 Soporte

Para problemas o preguntas sobre el sistema de backups:

1. Revisar logs de Railway
2. Verificar `/admin/backup/status`
3. Consultar esta documentación

---

## 🔄 Changelog

### v1.1.0 (2025-11-12)
- ✅ **Sistema de refresh automático de tokens** implementado
- ✅ Uso de refresh tokens en lugar de access tokens estáticos
- ✅ Renovación automática del token antes de expirar (buffer de 5 minutos)
- ✅ Nuevo endpoint `/admin/backup/validate-token` para diagnóstico
- ✅ Nuevo endpoint `/admin/backup/refresh-token` para forzar renovación
- ✅ Documentación completa sobre refresh tokens en DROPBOX_REFRESH_TOKEN.md
- ✅ Mejoras en mensajes de error y diagnóstico

### v1.0.0 (2025-11-09)
- ✅ Sistema de backups en 3 capas implementado
- ✅ Integración con Dropbox
- ✅ Cron jobs automáticos
- ✅ Endpoints API completos
- ✅ Scripts de ejecución manual
- ✅ Documentación completa
