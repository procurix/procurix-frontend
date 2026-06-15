# syntax=docker/dockerfile:1.6

FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
RUN npm install -g serve@14
COPY --from=build /app/dist ./dist

ENV NODE_ENV=production
CMD ["sh", "-c", "serve -s dist -l ${PORT:-3000}"]
