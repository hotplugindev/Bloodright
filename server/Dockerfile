# --- Development Stage ---
FROM node:20-alpine AS development
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
EXPOSE 3000
CMD ["npx", "nodemon", "src/index.js"]

# --- Production Stage ---
FROM node:20-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npx prisma generate
EXPOSE 3000
CMD ["node", "src/index.js"]
