#!/bin/bash

# Script de deploy seguro con backup automático
# Uso: ./deploy.sh [mensaje opcional]

echo "🚀 === DEPLOY SEGURO ACTPRION === 🚀"
echo ""

# Crear carpeta de backups si no existe
mkdir -p backups

# Timestamp para nombres únicos
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="backups/backup_$TIMESTAMP"

echo "📦 Paso 1: Creando backup de datos de Railway..."
echo "   Timestamp: $TIMESTAMP"

# Crear backup de la base de datos
echo "   🗄️  Descargando base de datos..."
railway run -- cat data/data.db > "backups/data_$TIMESTAMP.db"

# Crear backup completo de la carpeta data
echo "   📁 Descargando carpeta data completa..."
railway run -- tar -czf - data/ > "backups/data_complete_$TIMESTAMP.tar.gz"

# Verificar que los backups se crearon
if [ -f "backups/data_$TIMESTAMP.db" ]; then
    echo "   ✅ Backup de BD creado: data_$TIMESTAMP.db"
else
    echo "   ❌ Error creando backup de BD"
    exit 1
fi

if [ -f "backups/data_complete_$TIMESTAMP.tar.gz" ]; then
    echo "   ✅ Backup completo creado: data_complete_$TIMESTAMP.tar.gz"
else
    echo "   ❌ Error creando backup completo"
    exit 1
fi

echo ""
echo "🚀 Paso 2: Desplegando cambios a Railway..."

# Mensaje de commit opcional
if [ ! -z "$1" ]; then
    echo "   📝 Mensaje: $1"
fi

# Deploy
railway up

# Verificar si el deploy fue exitoso
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ ¡Deploy completado exitosamente!"
    echo "📦 Backup guardado en: backups/"
    echo "   - Base de datos: data_$TIMESTAMP.db"
    echo "   - Completo: data_complete_$TIMESTAMP.tar.gz"
    echo ""
    echo "💡 Para restaurar en caso de emergencia:"
    echo "   railway run -- cat backups/data_$TIMESTAMP.db > data/data.db"
else
    echo ""
    echo "❌ Error en el deploy. Los backups están seguros en backups/"
    exit 1
fi