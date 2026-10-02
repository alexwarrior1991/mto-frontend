# syntax=docker/dockerfile:1.7

# 1. Compilar la SPA: lo mismo que `npm run build`.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
RUN npm run build

# 2. Servirla con nginx sin privilegios: escucha en el 8080, como los demas contenedores del dominio.
#    La configuracion de cada entorno llega por variables y se comprueba al arrancar; la imagen no
#    lleva dentro a que realm ni a que gateway apunta (MTO_OIDC_AUTHORITY y MTO_GATEWAY_URL son
#    obligatorias).
FROM nginxinc/nginx-unprivileged:1.30-alpine
ENV MTO_OIDC_CLIENT_ID=mto-frontend \
    MTO_ENVIRONMENT="" \
    MTO_BACKOFFICE_URL="" \
    NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
    NGINX_ENVSUBST_FILTER="^(MTO_|NGINX_)"
COPY --chmod=755 docker/entrypoint/10-mto-check-env.sh /docker-entrypoint.d/
COPY docker/nginx/default.conf.template docker/nginx/security-headers.inc.template /etc/nginx/templates/
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --retries=5 CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
