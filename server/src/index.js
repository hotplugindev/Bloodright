require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { PrismaClient } = require('@prisma/client');

const authRoutes = require('./routes/auth');
const characterRoutes = require('./routes/characters');
const dynastyRoutes = require('./routes/dynasties');
const titleRoutes = require('./routes/titles');
const sessionRoutes = require('./routes/sessions');
const savegameRoutes = require('./routes/savegames');
const warRoutes = require('./routes/wars');
const diplomacyRoutes = require('./routes/diplomacy');
const { setupSocketManager } = require('./multiplayer/SocketManager');

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Make prisma and io available to routes
app.set('prisma', prisma);
app.set('io', io);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/characters', characterRoutes);
app.use('/api/dynasties', dynastyRoutes);
app.use('/api/titles', titleRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/savegames', savegameRoutes);
app.use('/api/wars', warRoutes);
app.use('/api/diplomacy', diplomacyRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Setup multiplayer
setupSocketManager(io, prisma);

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════╗
║   ⚔️  BLOODRIGHT: A Dynasty Game  ⚔️    ║
║   Server running on port ${PORT}           ║
╚══════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  await prisma.$disconnect();
  server.close(() => process.exit(0));
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down...');
  await prisma.$disconnect();
  server.close(() => process.exit(0));
});

module.exports = { app, server, io, prisma };
