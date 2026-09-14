import logger from '../config/logger.js';

// Custom error class for better error handling
export class AppError extends Error {
  constructor(message, statusCode, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Global error handling middleware
export const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let details = err.details || null;

  // Log error
  logger.error(`${statusCode} - ${message}`, {
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    userId: req.user?.id,
    stack: err.stack,
    details: details,
  });

  // MongoDB duplicate key error
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue)[0];
    message = `${field} already exists`;
    details = { field };
  }

  // MongoDB validation error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    details = Object.keys(err.errors).reduce((acc, key) => {
      acc[key] = err.errors[key].message;
      return acc;
    }, {});
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  // Cast error (invalid MongoDB ID)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
    details = { field: err.path, value: err.value };
  }

  // Don't leak error details in production
  const response = {
    success: false,
    message: process.env.NODE_ENV === 'production' && statusCode === 500
      ? 'Internal Server Error'
      : message,
  };

  // Include details in development or for operational errors
  if (process.env.NODE_ENV !== 'production' || err.isOperational) {
    if (details) response.details = details;
    if (process.env.NODE_ENV !== 'production') response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

// 404 handler
export const notFoundHandler = (req, res, next) => {
  const error = new AppError(`Route not found: ${req.originalUrl}`, 404);
  next(error);
};

// Async handler wrapper to catch async errors
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
