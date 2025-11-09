#!/bin/bash

# ============================================
# Script de Deploy Seguro - ActPrion Project
# ============================================
# Funcionalidades:
# - Backup automático antes de deploy
# - Push a GitHub
# - Deploy automático en Railway
# - Validaciones de seguridad
# ============================================

set -e  # Salir si hay error

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}🚀 ======================================${NC}"
echo -e "${BLUE}   DEPLOY SEGURO - ACTPRION PROJECT${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# ============================================
# PASO 0: Validaciones previas
# ============================================
echo -e "${YELLOW}🔍 Validando entorno...${NC}"

# Verificar que estamos en un repositorio git
if [ ! -d ".git" ]; then
    echo -e "${RED}❌ Error: No estás en un repositorio git${NC}"
    exit 1
fi

# Verificar que Railway CLI está instalado
if ! command -v railway &> /dev/null; then
    echo -e "${YELLOW}⚠️  Railway CLI no está instalado${NC}"
    echo "   Instalación: npm install -g @railway/cli"
    echo "   O continuar sin Railway (solo GitHub)"
    read -p "   ¿Continuar sin Railway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
    SKIP_RAILWAY=true
else
    SKIP_RAILWAY=false
fi

# Verificar que hay cambios para commitear
if git diff-index --quiet HEAD --; then
    echo -e "${YELLOW}⚠️  No hay cambios para commitear${NC}"
    read -p "   ¿Continuar con deploy de versión actual? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 0
    fi
    NO_CHANGES=true
else
    NO_CHANGES=false
fi

# Verificar que .env NO está en staging
if git ls-files --error-unmatch .env &> /dev/null; then
    echo -e "${RED}❌ ERROR CRÍTICO: .env está siendo trackeado por git${NC}"
    echo "   Ejecuta: git rm --cached .env"
    exit 1
fi

# Verificar que bases de datos NO están en staging
if git ls-files --error-unmatch data/data.db &> /dev/null || \
   git ls-files --error-unmatch data/*.db &> /dev/null || \
   git ls-files --error-unmatch data/sessions.db &> /dev/null; then
    echo -e "${RED}❌ ERROR CRÍTICO: Bases de datos están siendo trackeadas por git${NC}"
    echo -e "${RED}   ¡PELIGRO! Podrías sobrescribir datos de producción${NC}"
    echo ""
    echo "   Archivos problemáticos:"
    git ls-files | grep -E "data/.*\.db" | sed 's/^/   - /'
    echo ""
    echo "   Solución:"
    echo "   git rm --cached data/data.db data/sessions.db"
    echo "   git rm --cached data/*.db"
    exit 1
fi

echo -e "${GREEN}✅ Validaciones completadas${NC}"
echo ""

# ============================================
# PASO 1: Backup de Railway
# ============================================
if [ "$SKIP_RAILWAY" = false ]; then
    echo -e "${BLUE}📦 PASO 1: Creando backup de Railway...${NC}"

    # Crear carpeta de backups si no existe
    mkdir -p backups

    # Timestamp para nombres únicos
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

    echo "   📅 Timestamp: $TIMESTAMP"

    # Backup de la base de datos
    echo -n "   🗄️  Descargando base de datos... "
    if railway run -- cat data/data.db > "backups/data_$TIMESTAMP.db" 2>/dev/null; then
        SIZE=$(du -h "backups/data_$TIMESTAMP.db" | cut -f1)
        echo -e "${GREEN}✅ ($SIZE)${NC}"
    else
        echo -e "${YELLOW}⚠️  No se pudo descargar (¿Railway conectado?)${NC}"
    fi

    # Backup completo de la carpeta data
    echo -n "   📁 Descargando carpeta data completa... "
    if railway run -- tar -czf - data/ > "backups/data_complete_$TIMESTAMP.tar.gz" 2>/dev/null; then
        SIZE=$(du -h "backups/data_complete_$TIMESTAMP.tar.gz" | cut -f1)
        echo -e "${GREEN}✅ ($SIZE)${NC}"
    else
        echo -e "${YELLOW}⚠️  No se pudo descargar${NC}"
    fi

    echo -e "${GREEN}✅ Backups guardados en backups/${NC}"
    echo ""
else
    echo -e "${YELLOW}⏭️  Saltando backup de Railway (CLI no instalado)${NC}"
    echo ""
fi

# ============================================
# PASO 2: Commit y Push a GitHub
# ============================================
echo -e "${BLUE}📤 PASO 2: Subiendo a GitHub...${NC}"

if [ "$NO_CHANGES" = false ]; then
    # Pedir mensaje de commit
    if [ ! -z "$1" ]; then
        COMMIT_MSG="$1"
        echo "   📝 Mensaje: $COMMIT_MSG"
    else
        echo -n "   📝 Ingresa mensaje de commit: "
        read COMMIT_MSG

        # Si no ingresó mensaje, usar uno por defecto
        if [ -z "$COMMIT_MSG" ]; then
            COMMIT_MSG="deploy: actualización $(date +"%Y-%m-%d %H:%M")"
            echo "      Usando mensaje por defecto: $COMMIT_MSG"
        fi
    fi

    # Mostrar archivos que se van a commitear
    echo ""
    echo "   📋 Archivos modificados:"
    git status --short | sed 's/^/      /'
    echo ""

    # Confirmar antes de continuar
    read -p "   ¿Continuar con commit y push? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${YELLOW}❌ Deploy cancelado por el usuario${NC}"
        exit 0
    fi

    # Add todos los cambios
    echo -n "   ➕ Agregando cambios... "
    git add .
    echo -e "${GREEN}✅${NC}"

    # Commit
    echo -n "   💾 Creando commit... "
    git commit -m "$COMMIT_MSG" --quiet
    echo -e "${GREEN}✅${NC}"

    # Push a GitHub
    echo -n "   ⬆️  Subiendo a GitHub... "
    BRANCH=$(git branch --show-current)
    git push origin "$BRANCH" --quiet
    echo -e "${GREEN}✅${NC}"

    echo ""
    echo -e "${GREEN}✅ Código subido a GitHub (rama: $BRANCH)${NC}"
else
    echo -e "${YELLOW}⏭️  Sin cambios para commitear${NC}"
    BRANCH=$(git branch --show-current)
fi

echo ""

# ============================================
# PASO 3: Deploy en Railway
# ============================================
if [ "$SKIP_RAILWAY" = false ]; then
    echo -e "${BLUE}🚂 PASO 3: Deploy en Railway...${NC}"
    echo ""
    echo "   Railway detectará automáticamente el push a GitHub"
    echo "   y desplegará la nueva versión en 1-3 minutos."
    echo ""
    echo "   📊 Monitorea el progreso en:"
    echo "   🔗 https://railway.app/dashboard"
    echo ""

    read -p "   ¿Forzar deploy inmediato con 'railway up'? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        echo -n "   🚀 Ejecutando railway up... "
        railway up
        echo -e "${GREEN}✅ Deploy forzado completado${NC}"
    else
        echo -e "${BLUE}⏳ Railway desplegará automáticamente${NC}"
    fi
else
    echo -e "${YELLOW}⏭️  Saltando deploy de Railway (CLI no instalado)${NC}"
    echo "   GitHub está actualizado. Configura Railway para auto-deploy."
fi

echo ""

# ============================================
# RESUMEN FINAL
# ============================================
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✅ DEPLOY COMPLETADO EXITOSAMENTE   ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo "📋 Resumen:"
echo "   📦 Backup: backups/data_$TIMESTAMP.db"
echo "   🌿 Rama: $BRANCH"
echo "   📝 Commit: $COMMIT_MSG"
echo "   🔗 GitHub: ✅ Actualizado"
if [ "$SKIP_RAILWAY" = false ]; then
    echo "   🚂 Railway: ✅ Desplegando/Desplegado"
fi
echo ""
echo "💡 Comandos útiles:"
echo "   Ver logs: railway logs"
echo "   Ver status: railway status"
echo "   Restaurar backup: railway run -- cat backups/data_$TIMESTAMP.db > data/data.db"
echo ""
