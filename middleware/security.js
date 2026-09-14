import rateLimit from 'express-rate-limit';
import logger from '../config/logger.js';

// General API rate limiter
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res, next, options) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`, {
      path: req.path,
      method: req.method,
    });
    res.status(429).json(options.message);
  },
});

// Strict rate limiter for authentication endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 login attempts per windowMs
  skipSuccessfulRequests: true, // Don't count successful requests
  message: {
    success: false,
    message: 'Too many login attempts, please try again after 15 minutes',
  },
  handler: (req, res, next, options) => {
    logger.warn(`Auth rate limit exceeded for IP: ${req.ip}`, {
      path: req.path,
      method: req.method,
    });
    res.status(429).json(options.message);
  },
});

// NFC redirect rate limiter (stricter to prevent abuse)
export const redirectLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // limit each IP to 30 redirects per minute
  message: {
    success: false,
    message: 'Too many redirect requests, please slow down',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => {
    logger.warn(`Redirect rate limit exceeded for IP: ${req.ip}`, {
      cardId: req.params.cardId,
    });
    res.status(429).json(options.message);
  },
});

// Bot detection middleware
export const detectBot = (req, res, next) => {
  const userAgent = req.headers['user-agent'] || '';
  const botPatterns = [
    /bot/i,
    /crawl/i,
    /spider/i,
    /slurp/i,
    /mediapartners/i,
    /Googlebot/i,
    /Bingbot/i,
    /Yahoo/i,
    /DuckDuckBot/i,
    /Baiduspider/i,
    /YandexBot/i,
  ];

  const isBot = botPatterns.some((pattern) => pattern.test(userAgent));

  if (isBot) {
    logger.info(`Bot detected: ${userAgent}`, {
      ip: req.ip,
      path: req.path,
    });
    // Allow bots but mark them (don't block, just log)
    req.isBot = true;
  }

  next();
};

// Request size limiter
export const requestSizeLimiter = (req, res, next) => {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  const maxSize = 10 * 1024 * 1024; // 10MB

  if (contentLength > maxSize) {
    logger.warn(`Request too large: ${contentLength} bytes`, {
      ip: req.ip,
      path: req.path,
    });
    return res.status(413).json({
      success: false,
      message: 'Request entity too large',
    });
  }

  next();
};

// Security headers middleware
export const securityHeaders = (req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions policy
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=()'
  );

  // HSTS (HTTP Strict Transport Security) - only in production
  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }

  next();
};
