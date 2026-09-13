#!/usr/bin/env bash
#
# Reconstruye el paquete de entrega para el equipo de TI de EAFIT en dist/.
#
# dist/ no se versiona (ver .gitignore): el volcado SQL lleva datos semilla con
# credenciales y telefonos reales, y los .zip son artefactos que se rehacen a
# partir del codigo. Este script se corre justo antes de entregar, para que el
# paquete no quede desfasado del repositorio.
#
# Se conservan tal cual (se editan a mano, no se generan):
#   dist/ecoprestamos-database.sql   esquema + catalogo inicial
#   dist/GUIA_DESPLIEGUE_EAFIT.md    manual de despliegue
#
# Uso:  ./build-dist.sh
set -euo pipefail

cd "$(dirname "$0")"
DIST="dist"

if [ ! -f "$DIST/ecoprestamos-database.sql" ] || [ ! -f "$DIST/GUIA_DESPLIEGUE_EAFIT.md" ]; then
    echo "Falta el volcado SQL o la guia de despliegue en $DIST/. Se aborta." >&2
    exit 1
fi

# Compress-Archive de PowerShell viene con Windows; evita depender de "zip".
# Las rutas se traducen a formato Windows: PowerShell no entiende las rutas
# estilo POSIX que usa este shell (falla con "is not a valid file system path").
comprimir() {
    local origen="$1" destino="$2"
    rm -f "$destino"

    local origen_win destino_win
    origen_win="$(cygpath -w "${origen%/\*}")"
    [ "$origen" != "${origen%/\*}" ] && origen_win="$origen_win\\*"
    destino_win="$(cygpath -w "$destino")"

    powershell -NoProfile -NonInteractive -Command \
        "Compress-Archive -Path '$origen_win' -DestinationPath '$destino_win' -CompressionLevel Optimal" >/dev/null
}

echo "Empaquetando plugin y tema..."
comprimir "ecoprestamos-plugin" "$DIST/ecoprestamos-plugin.zip"
comprimir "ecoprestamos-theme" "$DIST/ecoprestamos-theme.zip"

echo "Armando el paquete maestro..."
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp "$DIST/ecoprestamos-plugin.zip" "$DIST/ecoprestamos-theme.zip" \
   "$DIST/ecoprestamos-database.sql" "$DIST/GUIA_DESPLIEGUE_EAFIT.md" "$STAGE/"

# El registro de cambios viaja dentro del paquete, no suelto en dist/.
[ -f MODIFICACIONES_ECOPRESTAMOS.md ] && cp MODIFICACIONES_ECOPRESTAMOS.md "$STAGE/"

comprimir "$STAGE/*" "$DIST/Ecoprestamos_Entrega_EAFIT.zip"

echo
echo "Paquete listo en $DIST/:"
ls -1sh "$DIST" | sed 's/^/  /'
