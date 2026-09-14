import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable is not set');
  console.error('Please set MONGODB_URI in your .env file');
  process.exit(1);
}

async function seed() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected to MongoDB');

    // Import models
    const { default: User } = await import('./models/User.js');
    const { default: Business } = await import('./models/Business.js');
    const { default: NfcCard } = await import('./models/NfcCard.js');
    const { Product } = await import('./models/Order.js');

    // Clear existing data (optional - comment out if you want to keep)
    // await Promise.all([User.deleteMany({}), Business.deleteMany({}), NfcCard.deleteMany({}), Product.deleteMany({})]);
    // console.log('✓ Cleared existing data');

    // Create admin user
    const adminExists = await User.findOne({ role: 'admin' });
    if (!adminExists) {
      const admin = await User.create({
        username: 'admin',
        password: 'admin123', // Will be hashed by pre-save hook
        email: 'admin@tapreview.com',
        fullName: 'Platform Admin',
        role: 'admin',
        isActive: true,
      });
      console.log('✓ Admin created: username=admin, password=admin123');
    }

    // Create sample business user (admin sets credentials)
    const businessUserExists = await User.findOne({ username: 'abcrestaurant' });
    if (!businessUserExists) {
      const businessUser = await User.create({
        username: 'abcrestaurant',
        password: 'demo123', // Admin sets this password
        email: 'owner@abcrestaurant.com',
        fullName: 'Marco Rossi',
        role: 'business',
        isActive: true,
      });

      // Create business
      const business = await Business.create({
        name: 'ABC Restaurant',
        slug: 'abc-restaurant',
        category: 'restaurant',
        owner: businessUser._id,
        description: 'Fine Italian dining in the heart of the city',
        address: { street: '123 Main St', city: 'New York', state: 'NY', zipCode: '10001', country: 'US' },
        phone: '+1-555-0123',
        isActive: true,
      });

      // Create NFC cards for this business
      await NfcCard.create([
        {
          cardId: 'card_8F72K',
          label: 'Main Counter',
          business: business._id,
          destinationUrl: 'https://g.page/r/abc-restaurant-review',
          type: 'both',
          isActive: true,
          stats: { totalScans: 5420, todayScans: 12, weekScans: 89, monthScans: 342 },
        },
        {
          cardId: 'card_3M91P',
          label: 'Table 1',
          business: business._id,
          destinationUrl: 'https://g.page/r/abc-restaurant-review',
          type: 'both',
          isActive: true,
          stats: { totalScans: 1240, todayScans: 5, weekScans: 34, monthScans: 128 },
        },
        {
          cardId: 'card_7K24Q',
          label: 'Table 2',
          business: business._id,
          destinationUrl: 'https://g.page/r/abc-restaurant-review',
          type: 'both',
          isActive: true,
          stats: { totalScans: 921, todayScans: 3, weekScans: 28, monthScans: 95 },
        },
        {
          cardId: 'card_5R88T',
          label: 'Takeaway Counter',
          business: business._id,
          destinationUrl: 'https://g.page/r/abc-restaurant-takeaway',
          type: 'both',
          isActive: true,
          stats: { totalScans: 3847, todayScans: 18, weekScans: 127, monthScans: 489 },
        },
      ]);
      console.log('✓ Business "ABC Restaurant" created with 4 NFC cards');
      console.log('  Login: username=abcrestaurant, password=demo123');
    }

    // Create products
    const productExists = await Product.findOne({});
    if (!productExists) {
      await Product.create([
        { name: 'Starter Pack', slug: 'starter', price: 29, cardCount: 1, cardType: 'both', description: '1 NFC card + QR code' },
        { name: 'Professional Pack', slug: 'professional', price: 79, cardCount: 5, cardType: 'both', description: '5 NFC cards + QR codes' },
        { name: 'Enterprise Pack', slug: 'enterprise', price: 199, cardCount: 10, cardType: 'both', description: '10 NFC cards + QR codes' },
      ]);
      console.log('✓ Products created');
    }

    console.log('\n═══════════════════════════════════════');
    console.log('  Seed complete!');
    console.log('═══════════════════════════════════════');
    console.log('  Admin login: admin / admin123');
    console.log('  Business login: abcrestaurant / demo123');
    console.log('═══════════════════════════════════════\n');

    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
}

seed();
