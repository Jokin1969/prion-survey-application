# Cómo Obtener el Refresh Token de Dropbox

Los tokens de Dropbox modernos **expiran en unas pocas horas** (típicamente 4 horas). Por eso necesitamos usar un **refresh token** que nunca expira y nos permite obtener nuevos access tokens automáticamente.

## Paso 1: Crear una App en Dropbox

1. Ve a [Dropbox App Console](https://www.dropbox.com/developers/apps)
2. Click en **"Create app"**
3. Selecciona:
   - **Scoped access**
   - **Full Dropbox** (o "App folder" si prefieres limitar el acceso)
4. Dale un nombre a tu app (ej: "ActPrion Backups")
5. Click en **"Create app"**

## Paso 2: Configurar Permisos

En la pestaña **"Permissions"** de tu app, asegúrate de tener habilitados estos permisos:

- ✅ `files.metadata.write`
- ✅ `files.content.write`
- ✅ `files.content.read`

Click en **"Submit"** para guardar los cambios.

## Paso 3: Obtener App Key y App Secret

En la pestaña **"Settings"**:

1. Copia el **App key** → Esta es tu `DROPBOX_APP_KEY`
2. Click en **"Show"** junto a "App secret"
3. Copia el **App secret** → Esta es tu `DROPBOX_APP_SECRET`

## Paso 4: Obtener el Refresh Token

Hay **dos métodos** para obtener el refresh token:

### Método A: Usando el flujo OAuth (Recomendado)

1. En la sección **"OAuth 2"** de Settings, busca **"Redirect URIs"**
2. Agrega esta URL: `http://localhost:3000/oauth/callback`
3. Guarda los cambios

4. Abre tu navegador y ve a esta URL (reemplaza `TU_APP_KEY` con tu App Key):

```
https://www.dropbox.com/oauth2/authorize?client_id=TU_APP_KEY&token_access_type=offline&response_type=code
```

5. Autoriza la aplicación
6. Serás redirigido a una URL como: `http://localhost:3000/oauth/callback?code=CODIGO_AQUI`
7. Copia el **código** de la URL

8. Usa este comando `curl` para obtener el refresh token (reemplaza los valores):

```bash
curl -X POST https://api.dropbox.com/oauth2/token \
  -d grant_type=authorization_code \
  -d code=TU_CODIGO \
  -d client_id=TU_APP_KEY \
  -d client_secret=TU_APP_SECRET
```

9. La respuesta incluirá un `refresh_token` → Esta es tu `DROPBOX_REFRESH_TOKEN`

### Método B: Usando la Dropbox CLI (Alternativo)

Si tienes instalado [Dropbox CLI](https://www.dropbox.com/developers/documentation/http/documentation#auth-token-from_oauth1):

```bash
# Instalar dropbox-cli
npm install -g dropbox-cli

# Autenticarse
dropbox-cli auth

# El refresh token se guardará automáticamente
```

## Paso 5: Configurar Variables de Entorno

En tu archivo `.env` o en las variables de entorno de Railway, configura:

```env
DROPBOX_REFRESH_TOKEN=tu_refresh_token_aqui
DROPBOX_APP_KEY=tu_app_key_aqui
DROPBOX_APP_SECRET=tu_app_secret_aqui
```

## Paso 6: Verificar la Configuración

Para verificar que todo funciona correctamente, puedes:

1. **Desde el navegador**: Visita `https://tu-app.railway.app/api/admin/dropbox/validate-token`
2. **Desde terminal**: `curl https://tu-app.railway.app/api/admin/dropbox/validate-token`

Si la configuración es correcta, verás:

```json
{
  "valid": true,
  "message": "Token válido y funcionando correctamente",
  "account": {
    "name": "Tu Nombre",
    "email": "tu@email.com",
    "accountId": "..."
  }
}
```

## ¿Cómo Funciona el Sistema de Refresh?

1. **Al iniciar**: La aplicación NO tiene un access token
2. **Primera operación**: Cuando se necesita hacer una operación con Dropbox:
   - El sistema usa el `DROPBOX_REFRESH_TOKEN` para obtener un nuevo `access_token`
   - Guarda el token en memoria junto con su tiempo de expiración
3. **Operaciones posteriores**: El sistema verifica si el token está próximo a expirar
   - Si le quedan más de 5 minutos → usa el token actual
   - Si está por expirar → obtiene uno nuevo automáticamente
4. **Renovación automática**: Todo sucede transparentemente, sin intervención manual

## Revocar Acceso

Si necesitas revocar el acceso:

1. Ve a [Aplicaciones conectadas en Dropbox](https://www.dropbox.com/account/connected_apps)
2. Busca tu app y click en **"Desconectar"**
3. Esto invalidará el refresh token y tendrás que generar uno nuevo

## Solución de Problemas

### Error: "invalid_grant"
- El código de autorización expiró (solo dura 10 minutos)
- Repite el proceso desde el Paso 4

### Error: "invalid_client"
- Verifica que `DROPBOX_APP_KEY` y `DROPBOX_APP_SECRET` sean correctos
- Asegúrate de no tener espacios en blanco

### Error: "Token expirado, revocado o inválido"
- El refresh token fue revocado en Dropbox
- Genera un nuevo refresh token siguiendo el Paso 4

### Los backups no se guardan
- Verifica que las 3 variables estén configuradas: `DROPBOX_REFRESH_TOKEN`, `DROPBOX_APP_KEY`, `DROPBOX_APP_SECRET`
- Revisa los logs de Railway para ver si hay errores específicos
- Usa el endpoint `/api/admin/dropbox/validate-token` para diagnosticar

## Seguridad

⚠️ **IMPORTANTE**:
- **NUNCA** compartas tu `DROPBOX_APP_SECRET` o `DROPBOX_REFRESH_TOKEN`
- **NUNCA** los subas a repositorios públicos
- Guárdalos solo en variables de entorno seguras (Railway, Heroku, etc.)
- Si crees que fueron comprometidos, revócalos inmediatamente en Dropbox

## Recursos Adicionales

- [Documentación oficial de Dropbox OAuth 2](https://developers.dropbox.com/oauth-guide)
- [API Reference de Dropbox](https://www.dropbox.com/developers/documentation/http/overview)
