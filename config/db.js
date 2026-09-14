import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Security: Never hardcode credentials - use environment variables only
const MONGODB_URI = process.env.MONGODB_URI;

export const connectDB = async () => {
  try {
    if (!MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is not set');
    }

    const conn = await mongoose.connect(MONGODB_URI, {
      maxPoolSize: 50, // Optimized for production
      minPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4, // Use IPv4
      retryWrites: true,
      retryReads: true,
    });

    console.log(`✓ MongoDB Connected: ${conn.connection.host}`);
    console.log(`  Database: ${conn.connection.name}`);
    console.log(`  Pool Size: ${conn.connections[0]._readyState === 1 ? 'Active' : 'Inactive'}`);
    return conn;
  } catch (error) {
    console.error('✗ MongoDB Connection Error:', error.message);
    console.error('  Please check:');
    console.error('  1. MONGODB_URI is set in .env');
    console.error('  2. IP address is whitelisted in MongoDB Atlas');
    console.error('  3. Username and password are correct');
    process.exit(1);
  }
};

mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected');
});

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  process.exit(0);
});
