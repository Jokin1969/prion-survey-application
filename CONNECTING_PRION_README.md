# Connecting Prion Databases - Sistema de Gestión de Individuos

Este directorio contiene el código del sistema de gestión de individuos con enfermedades priónicas.

## Estructura de Archivos

- `public/` - Frontend del sistema de gestión de individuos
  - `public/js/app.js` - Aplicación principal con fix para botón de borrado
  - `public/css/styles.css` - Estilos
  - `public/index.html` - Página principal

- `services/` - Servicios backend
  - `services/dropboxService.js` - Integración con Dropbox para documentos
  - `services/csvService.js` - Manejo de archivos CSV
  - `services/csvSync.js` - Sincronización de CSV desde Dropbox
  - `services/i18nService.js` - Sistema multi-idioma (ES, CA, EN, EU)

- `locales/` - Traducciones en 4 idiomas

- `connecting-prion-data/` - Datos de ejemplo (CSV ficticios)

- `connecting-prion-server.js` - Servidor Node.js/Express

- `connecting-prion-package.json` - Dependencias del proyecto

## Última Actualización

**Fix aplicado:** Corregido problema donde el botón de borrado (🗑️) dejaba de funcionar después de un error.

**Problema:** Al usar `innerHTML = originalHTML` para restaurar el UI después de un error, se perdían todos los event handlers de JavaScript.

**Solución:** Ahora se re-renderiza correctamente usando `renderCICell()` que vuelve a adjuntar los event handlers.

## Archivos Modificados

- `public/js/app.js` - Función `handleCIDelete()` líneas 497-546
