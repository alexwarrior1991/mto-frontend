#!/bin/sh
# Aborta el arranque del contenedor si falta su configuracion o no vale. Sin esto, nginx arrancaria
# con valores vacios y el fallo saldria en el navegador, lejos de su causa. Un .sh de
# /docker-entrypoint.d que termina con error para el contenedor.
set -eu

fail() {
    echo "mto-frontend: $*" >&2
    exit 1
}

# Lo que se vuelca en /config.json y en la CSP no puede romper ni el JSON ni la cabecera.
check_plain() {
    case "$2" in
        *\"* | *\\* | *\'*) fail "$1 no puede llevar comillas ni barras invertidas" ;;
    esac
}

for name in MTO_OIDC_AUTHORITY MTO_OIDC_CLIENT_ID MTO_GATEWAY_URL; do
    eval "value=\${$name:-}"
    [ -n "$value" ] || fail "falta la variable $name"
    check_plain "$name" "$value"
done

for name in MTO_ENVIRONMENT MTO_BACKOFFICE_URL; do
    eval "value=\${$name:-}"
    check_plain "$name" "$value"
done

case "$MTO_OIDC_AUTHORITY" in
    http://* | https://*) ;;
    *) fail "MTO_OIDC_AUTHORITY tiene que ser la URL http(s) del realm: $MTO_OIDC_AUTHORITY" ;;
esac

# Sin ruta: nginx pasa la URI tal cual (/api/...), y una ruta aqui la sustituiria.
echo "$MTO_GATEWAY_URL" | grep -Eq '^https?://[^/]+$' \
    || fail "MTO_GATEWAY_URL tiene que ser http(s)://host:puerto, sin ruta ni barra final: $MTO_GATEWAY_URL"

# El entrypoint de nginx no falla si no puede escribir la configuracion: arrancaria con la de fabrica.
[ -w /etc/nginx/conf.d ] || fail "/etc/nginx/conf.d no se puede escribir: la configuracion no se generaria"
