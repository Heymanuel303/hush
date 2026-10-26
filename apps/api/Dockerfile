# Build context is the repository root: docker build -f apps/api/Dockerfile .
FROM node:22.23-bookworm-slim AS build
# openssl: Prisma picks its engines from the installed OpenSSL, so build and runtime
# stages must install the same one.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# The corepack bundled with the node image cannot start current pnpm; install a recent
# one. The pnpm version itself comes from "packageManager" in package.json.
RUN npm install -g corepack@latest && corepack enable
WORKDIR /repo
COPY . .
# Deviation from the starter kit: @heymanuel303/idp-client comes from GitHub Packages, so the
# install needs a read token. It arrives as a BuildKit secret (never an ARG/ENV), is written to
# the user npmrc for this one RUN and removed again, so no layer keeps it. The runtime stage has
# no pnpm and never sees it.
RUN --mount=type=secret,id=node_auth_token \
    sh -c 'printf "//npm.pkg.github.com/:_authToken=%s\n" "$(cat /run/secrets/node_auth_token)" > /root/.npmrc \
      && pnpm install --frozen-lockfile; rc=$?; rm -f /root/.npmrc; exit $rc'
# Build the shared contracts, generate the Prisma client, compile the api and copy the api
# with its production dependencies only to /out/api.
RUN pnpm --filter contracts build \
 && pnpm --filter api exec prisma generate \
 && pnpm --filter api build \
 && pnpm --filter api --prod deploy /out/api

FROM node:22.23-bookworm-slim AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /out/api /app
WORKDIR /app
ENV NODE_ENV=production
USER node
EXPOSE 3000
# Migrations run in the compose `migrate` service with the same image
# (./node_modules/.bin/prisma migrate deploy). This stage has no package manager:
# it only runs the compiled api.
CMD ["node", "dist/main.js"]
