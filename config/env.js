import dotenv from 'dotenv';

dotenv.config();

// Define required environment variables for each environment
const requiredEnvVars = {
  development: ['MONGODB_URI', 'JWT_SECRET', 'NODE_ENV'],
  production: [
    'MONGODB_URI',
    'JWT_SECRET',
    'NODE_ENV',
    'FRONTEND_URL',
    'JWT_EXPIRES_IN',
  ],
};

// Validate JWT secret strength
const validateJWTSecret = (secret) => {
  if (!secret) return false;
  if (secret.length < 32) {
    console.error('❌ JWT_SECRET must be at least 32 characters long');
    return false;
  }
  // Check for weak/common secrets
  const weakSecrets = [
    'secret',
    'password',
    '123456',
    'your-secret-key',
    'change-this',
    'tapreview-super-secret-jwt-key-2024-production',
  ];
  if (weakSecrets.some((weak) => secret.toLowerCase().includes(weak))) {
    console.error('❌ JWT_SECRET is too weak or commonly used');
    console.error('   Generate a strong secret with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
    return false;
  }
  return true;
};

// Validate MongoDB URI format
const validateMongoURI = (uri) => {
  if (!uri) return false;
  if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
    console.error('❌ MONGODB_URI must start with mongodb:// or mongodb+srv://');
    return false;
  }
  // Check for hardcoded credentials in URI
  if (uri.includes('jock-nfc:UClDoI6XVAv2Gj1R')) {
    console.error('❌ MONGODB_URI contains hardcoded credentials');
    console.error('   Please use environment variables for sensitive data');
    return false;
  }
  return true;
};

export const validateEnv = () => {
  const env = process.env.NODE_ENV || 'development';
  const required = requiredEnvVars[env] || requiredEnvVars.development;

  console.log(`\n🔍 Validating environment variables for: ${env}\n`);

  let hasErrors = false;

  // Check required variables
  const missing = required.filter((varName) => !process.env[varName]);

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach((varName) => console.error(`   - ${varName}`));
    hasErrors = true;
  }

  // Validate JWT secret
  if (process.env.JWT_SECRET && !validateJWTSecret(process.env.JWT_SECRET)) {
    hasErrors = true;
  }

  // Validate MongoDB URI
  if (process.env.MONGODB_URI && !validateMongoURI(process.env.MONGODB_URI)) {
    hasErrors = true;
  }

  // Validate FRONTEND_URL in production
  if (env === 'production' && process.env.FRONTEND_URL) {
    try {
      new URL(process.env.FRONTEND_URL);
    } catch {
      console.error('❌ FRONTEND_URL is not a valid URL');
      hasErrors = true;
    }
  }

  if (hasErrors) {
    console.error('\n❌ Environment validation failed. Please fix the issues above.\n');
    process.exit(1);
  }

  console.log('✅ Environment variables validated successfully\n');
};

// Export environment config
export const envConfig = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  mongodbUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  redirectCacheTTL: parseInt(process.env.REDIRECT_CACHE_TTL, 10) || 300,
};
