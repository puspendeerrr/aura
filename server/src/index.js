require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const prisma = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const postRoutes = require('./routes/postRoutes');
const storyRoutes = require('./routes/storyRoutes');
const chatRoutes = require('./routes/chatRoutes');
const adminRoutes = require('./routes/adminRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const { registerChatHandlers } = require('./sockets/chatHandler');
const { apiLimiter } = require('./middlewares/security');

const app = express();
const server = http.createServer(app);

// Apply Helmet for security headers (XSS protections, frame guards, etc.)
app.use(helmet({
  crossOriginResourcePolicy: false, // allows images to load from other domains
}));

// Apply global rate limiting to all api endpoints
app.use('/api', apiLimiter);

// Configure CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets if local fallback occurs
const uploadsDir = path.join(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsDir));

// API Router Mounts
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/stories', storyRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);

// Base route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Aura API' });
});

// Configure Socket.io server
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Initialize Socket event handlers
registerChatHandlers(io);

// Story Expiration Scheduler (autocleans every 10 mins)
setInterval(async () => {
  try {
    const now = new Date();
    // Delete expired stories from postgres DB
    const expiredStories = await prisma.story.findMany({
      where: { expiresAt: { lte: now } },
    });

    if (expiredStories.length > 0) {
      await prisma.story.deleteMany({
        where: { expiresAt: { lte: now } },
      });
      console.log(`[STORY SCRUBBER] Auto-cleaned ${expiredStories.length} expired stories from database.`);
    }
  } catch (err) {
    console.error('[STORY SCRUBBER] Failed to scrub stories:', err);
  }
}, 10 * 60 * 1000);

// Centralized error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'An unexpected error occurred on the server' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  console.log(`\n==========================================\n[AURA SERVER ACTIVE] listening on port ${PORT}\n==========================================\n`);
  
  // Seed admin user automatically if DB is active
  try {
    const bcrypt = require('bcrypt');
    const adminUser = await prisma.user.findUnique({
      where: { username: 'admin' }
    });
    if (!adminUser) {
      const passwordHash = await bcrypt.hash('adminpassword123', 10);
      await prisma.user.create({
        data: {
          username: 'admin',
          email: 'admin@aurasocial.com',
          passwordHash,
          verified: true,
          name: 'Aura Moderator',
          bio: 'System Admin and platform moderator.',
          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120'
        }
      });
      console.log('[SEED] Automatically created admin user account (username: admin, pass: adminpassword123).');
    }
  } catch (err) {
    console.log('[SEED] Auto-seed skipped: PostgreSQL connection is not active yet.');
  }
});
