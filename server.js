import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import { connectDB } from './config/db.js';
import { validateEnv, envConfig } from './config/env.js';
import logger, { requestLogger, errorLogger } from './config/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiLimiter, authLimiter, securityHeaders, detectBot, requestSizeLimiter } from './middleware/security.js';
import User from './models/User.js';
import { Product } from './models/Order.js';

// Route imports
import authRoutes from './routes/auth.js';
import businessRoutes from './routes/business.js';
import cardRoutes from './routes/cards.js';
import redirectRoutes from './routes/redirect.js';
import adminRoutes from './routes/admin.js';
import orderRoutes from './routes/orders.js';
import analyticsRoutes from './routes/analytics.js';

// Validate environment variables
validateEnv();

const app = express();

// ============================================
// SECURITY MIDDLEWARE
// ============================================

// Security headers
app.use(securityHeaders);

// Helmet for additional security headers
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
  crossOriginEmbedderPolicy: false,
}));

// MongoDB injection protection
app.use(mongoSanitize());

// CORS - restrict to specific origins in production
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? [envConfig.frontendUrl]
    : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// Bot detection
app.use(detectBot);

// Request size limiter
app.use(requestSizeLimiter);

// ============================================
// PARSING MIDDLEWARE
// ============================================

// Body parsing with size limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Normalize every route response at the boundary so legacy handlers cannot
// leak mixed response shapes to clients.
app.use((req, res, next) => {
  const sendJson = res.json.bind(res);
  res.json = (body) => {
    if (body && body.success === false) {
      return sendJson({ success: false, error: body.error || body.message || 'Request failed' });
    }
    if (body && typeof body.success === 'boolean') {
      return sendJson(body);
    }
    if (body && typeof body.error === 'string') {
      return sendJson({ success: false, error: body.error });
    }
    return sendJson({ success: true, data: body });
  };
  next();
});

// ============================================
// LOGGING MIDDLEWARE
// ============================================

// Request logging (skip health checks)
app.use(requestLogger);

// ============================================
// RATE LIMITING
// ============================================

// General API rate limiter
app.use('/api/', apiLimiter);

// Stricter rate limit for auth endpoints
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);

// ============================================
// API ROUTES
// ============================================

// Health check endpoint (for monitoring and load balancers)
app.get('/api/health', async (req, res) => {
  const healthcheck = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
    },
    database: 'unknown',
  };

  try {
    // Check database connection
    const mongoose = (await import('mongoose')).default;
    if (mongoose.connection.readyState === 1) {
      healthcheck.database = 'connected';
    } else {
      healthcheck.database = 'disconnected';
      healthcheck.status = 'degraded';
    }

    const statusCode = healthcheck.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(healthcheck);
  } catch (error) {
    healthcheck.database = 'error';
    healthcheck.status = 'error';
    healthcheck.error = error.message;
    res.status(503).json(healthcheck);
  }
});

// Auth routes (login, register, password reset)
app.use('/api/auth', authRoutes);

// Business/Store routes
app.use('/api/businesses', businessRoutes);

// NFC Card routes
app.use('/api/cards', cardRoutes);

// NFC Redirect (optimized for speed)
app.use('/s', redirectRoutes);

// Admin routes
app.use('/api/admin', adminRoutes);

// Order routes
app.use('/api/orders', orderRoutes);

// Analytics routes
app.use('/api/analytics', analyticsRoutes);

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler
app.use(notFoundHandler);

// Error logging middleware
app.use(errorLogger);

// Global error handler
app.use(errorHandler);

// ============================================
// START SERVER
// ============================================

export const ensureDefaultAdmin = async () => {
  try {
    const adminExists = await User.findOne({ role: 'admin' });
    if (!adminExists) {
      await User.create({
        username: 'admin',
        password: process.env.DEFAULT_ADMIN_PASSWORD || crypto.randomBytes(12).toString('hex'),
        email: 'admin@tapreview.com',
        fullName: 'Platform Admin',
        role: 'admin',
        isActive: true,
      });
      logger.info('Default admin user created: username=admin, password=admin123');
    }
  } catch (error) {
    logger.error('Failed to ensure default admin user:', { error: error.message, stack: error.stack });
    throw error;
  }
};

export const ensureDefaultProducts = async () => {
  const defaultProducts = [
    {
      name: 'Starter Pack',
      slug: 'starter',
      price: 29,
      cardCount: 1,
      cardType: 'both',
      description: '1 NFC card + QR code',
    },
    {
      name: 'Professional Pack',
      slug: 'professional',
      price: 79,
      cardCount: 5,
      cardType: 'both',
      description: '5 NFC cards + QR codes',
    },
    {
      name: 'Enterprise Pack',
      slug: 'enterprise',
      price: 199,
      cardCount: 10,
      cardType: 'both',
      description: '10 NFC cards + QR codes',
    },
  ];

  const productCount = await Product.countDocuments();
  if (productCount === 0) {
    await Product.create(defaultProducts);
    logger.info('Default card packages created');
    return;
  }

  await Promise.all(defaultProducts.map((product) => Product.updateOne(
    { slug: product.slug },
    { $set: { cardCount: product.cardCount } },
  )));
};

const startServer = async () => {
  try {
    // Connect to MongoDB Atlas
    await connectDB();
    await ensureDefaultAdmin();
    await ensureDefaultProducts();

    const PORT = envConfig.port;

    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`
╔══════════════════════════════════════════╗
║     TapReview Backend API Server         ║
║     Port: ${PORT}                          ║
║     Env: ${envConfig.nodeEnv}                     ║
╚══════════════════════════════════════════╝
      `);
      logger.info(`Server started successfully on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', { error: error.message, stack: error.stack });
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;
