FROM node:20-alpine AS builder

WORKDIR /app

# Copy root and backend packages
COPY package*.json ./
COPY backend/package*.json ./backend/

RUN npm install

COPY backend ./backend

WORKDIR /app/backend
RUN npx prisma generate --schema=./prisma/schema.postgres.prisma
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY package*.json ./
COPY backend/package*.json ./backend/

RUN npm install --omit=dev

COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/prisma ./backend/prisma
COPY --from=builder /app/node_modules ./node_modules

WORKDIR /app/backend

EXPOSE 4000

CMD ["sh", "-c", "npx prisma db push --schema=./prisma/schema.postgres.prisma && npx tsx prisma/seed.ts && node dist/index.js"]
