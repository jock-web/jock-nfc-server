import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable is not set');
  console.error('Please set MONGODB_URI in your .env file');
  process.exit(1);
}

async function testDatabase() {
  console.log('🔍 Testing MongoDB Connection...\n');
  console.log('Connection String:', MONGODB_URI.replace(/\/\/.*@/, '//<credentials>@'));
  console.log('');

  try {
    // Test 1: Connection
    console.log('📡 Test 1: Connecting to MongoDB Atlas...');
    const conn = await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log('✅ Connected successfully!');
    console.log(`   Host: ${conn.connection.host}`);
    console.log(`   Database: ${conn.connection.name}`);
    console.log('');

    // Test 2: Create a test collection
    console.log('📝 Test 2: Testing database operations...');
    const testSchema = new mongoose.Schema({
      name: String,
      timestamp: Date
    });
    
    const TestModel = mongoose.model('TestConnection', testSchema);
    
    // Create
    const testDoc = await TestModel.create({
      name: 'Connection Test',
      timestamp: new Date()
    });
    console.log('✅ Created test document:', testDoc._id);

    // Read
    const found = await TestModel.findById(testDoc._id);
    console.log('✅ Read document successfully:', found.name);

    // Update
    found.name = 'Updated Test';
    await found.save();
    console.log('✅ Updated document successfully');

    // Delete
    await TestModel.deleteOne({ _id: testDoc._id });
    console.log('✅ Deleted test document successfully');
    console.log('');

    // Test 3: Check collections
    console.log('📊 Test 3: Checking existing collections...');
    const collections = await mongoose.connection.db.listCollections().toArray();
    if (collections.length > 0) {
      console.log('✅ Found collections:');
      collections.forEach(col => {
        console.log(`   - ${col.name}`);
      });
    } else {
      console.log('ℹ️  No collections yet (database is empty)');
    }
    console.log('');

    // Test 4: Connection health
    console.log('💓 Test 4: Connection health check...');
    const admin = mongoose.connection.db.admin();
    const serverStatus = await admin.serverStatus();
    console.log('✅ Server status: OK');
    console.log(`   Version: ${serverStatus.version}`);
    console.log(`   Uptime: ${Math.floor(serverStatus.uptime / 60)} minutes`);
    console.log('');

    // Cleanup
    await mongoose.connection.close();
    console.log('🎉 All tests passed! Database is working correctly.\n');
    
    return true;
  } catch (error) {
    console.error('\n❌ Database test failed!\n');
    console.error('Error:', error.message);
    
    if (error.message.includes('ENOTFOUND')) {
      console.error('\n💡 Possible issues:');
      console.error('   - DNS resolution failed');
      console.error('   - Check your internet connection');
      console.error('   - Verify MongoDB Atlas cluster is running');
    } else if (error.message.includes('authentication')) {
      console.error('\n💡 Possible issues:');
      console.error('   - Invalid username or password');
      console.error('   - User does not have access to this cluster');
    } else if (error.message.includes('network')) {
      console.error('\n💡 Possible issues:');
      console.error('   - IP address not whitelisted in MongoDB Atlas');
      console.error('   - Firewall blocking connection');
      console.error('   - Network connectivity issues');
    }
    
    return false;
  }
}

testDatabase().then(success => {
  process.exit(success ? 0 : 1);
});
