# Pin an exact Node version so "works in Docker" == "works everywhere" —
# the whole point of containerizing. Update this deliberately, not by accident.

# ---- Build stage ----
# Needs devDependencies (tailwindcss) to compile public/css/tailwind.css from
# the real page markup — the CDN Play script used in dev is explicitly not
# meant for production (it ships the whole JIT compiler to the browser and
# recompiles on every page load). This stage never ships in the final image.
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tailwind.config.js ./
COPY src ./src
COPY public ./public
RUN npm run build:css

# ---- Runtime stage ----
FROM node:22-alpine

WORKDIR /app

# Install dependencies first so Docker can cache this layer between builds
# (it only re-runs npm install when package*.json actually changes).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
# From the build stage, not the host — this is the copy that already has
# public/css/tailwind.css compiled into it.
COPY --from=build /app/public ./public

ENV NODE_ENV=production

# Run as the unprivileged "node" user (built into the image), not root: if the app
# were ever compromised, the attacker would not own the container. The uploads
# directory is created here and handed to that user, so the named volume mounted
# on it (see docker-compose.yml) is writable.
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node

EXPOSE 5000

CMD ["node", "src/server.js"]
