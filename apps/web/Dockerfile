# Build context is the repository root: docker build -f apps/web/Dockerfile .
FROM node:22.23-bookworm-slim AS build
# The corepack bundled with the node image cannot start current pnpm; install a recent
# one. The pnpm version itself comes from "packageManager" in package.json.
RUN npm install -g corepack@latest && corepack enable
WORKDIR /repo
COPY . .
# Vite inlines every VITE_ variable at build time, so the api base is a build argument.
# The api is reached same-origin through this image's nginx (/api/ -> API_UPSTREAM).
ARG VITE_API_BASE=/api
ENV VITE_API_BASE=$VITE_API_BASE
# Deviation from the starter kit: @heymanuel303/idp-client comes from GitHub Packages, so the
# install needs a read token. It arrives as a BuildKit secret (never an ARG/ENV), is written to
# the user npmrc for this one RUN and removed again, so no layer keeps it. The runtime stage has
# no pnpm and never sees it.
RUN --mount=type=secret,id=node_auth_token \
    sh -c 'printf "//npm.pkg.github.com/:_authToken=%s\n" "$(cat /run/secrets/node_auth_token)" > /root/.npmrc \
      && pnpm install --frozen-lockfile; rc=$?; rm -f /root/.npmrc; exit $rc'
RUN pnpm --filter contracts build && pnpm --filter web build

FROM nginx:1.29-alpine AS runtime
# The nginx image renders /etc/nginx/templates/*.template into conf.d at start, substituting
# API_UPSTREAM. docker-compose.yml sets the same value; this default covers a bare `docker run`.
ENV API_UPSTREAM=http://hush-api:3000
COPY apps/web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
