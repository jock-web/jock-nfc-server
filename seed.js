import crypto from 'crypto';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable is not set');
  console.error('Please set MONGODB_URI in your .env file');
  process.exit(1);
}

// ============================================
// CONFIG (env-driven, no hardcoded credentials)
// ============================================
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@tapreview.com';
const ADMIN_FULLNAME = process.env.ADMIN_FULLNAME || 'Platform Admin';

// If ADMIN_PASSWORD isn't set, generate a strong random one and print it
// ONCE so it can be captured and stored in a password manager.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || crypto.randomBytes(16).toString('hex');
const ADMIN_PASSWORD_WAS_GENERATED = !process.env.ADMIN_PASSWORD;

const WEAK_PASSWORDS = ['admin123', 'password', '123456', 'demo123', 'changeme'];

// Demo/sample business data is OFF by default. Only turns on if you
// explicitly opt in — prevents a fake "ABC Restaurant" from ever
// appearing in a real production database.
const SEED_DEMO_DATA = process.env.SEED_DEMO_DATA === 'true';

function assertStrongPassword(password, label) {
  if (password.length < 8) {
    console.error(`❌ ${label} is too short (min 8 characters)`);
    process.exit(1);
  }
  if (WEAK_PASSWORDS.includes(password.toLowerCase())) {
    console.error(`❌ ${label} is a known weak/default password. Set a stronger one via env var.`);
    process.exit(1);
  }
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

    // ============================================
    // ADMIN USER
    // ============================================
    const adminExists = await User.findOne({ role: 'admin' });
    if (!adminExists) {
      assertStrongPassword(ADMIN_PASSWORD, 'ADMIN_PASSWORD');

      await User.create({
        username: ADMIN_USERNAME,
        password: ADMIN_PASSWORD, // hashed by the User pre-save hook
        email: ADMIN_EMAIL,
        fullName: ADMIN_FULLNAME,
        role: 'admin',
        isActive: true,
      });

      console.log(`✓ Admin created: username=${ADMIN_USERNAME}`);
      if (ADMIN_PASSWORD_WAS_GENERATED) {
        console.log('');
        console.log('  ⚠️  No ADMIN_PASSWORD was set — a random one was generated.');
        console.log(`  ⚠️  Password (shown once, will NOT be logged again): ${ADMIN_PASSWORD}`);
        console.log('  ⚠️  Store it now (password manager). It is not saved anywhere in plaintext.');
        console.log('');
      } else {
        console.log('  Password: (taken from ADMIN_PASSWORD env var — not logged)');
      }
    } else {
      console.log('✓ Admin user already exists — skipping');
    }

    // ============================================
    // DEMO BUSINESS + CARDS (opt-in only)
    // ============================================
    if (SEED_DEMO_DATA) {
      const businessUserExists = await User.findOne({ username: 'abcrestaurant' });
      if (!businessUserExists) {
        const demoPassword = process.env.DEMO_BUSINESS_PASSWORD || crypto.randomBytes(12).toString('hex');
        assertStrongPassword(demoPassword, 'DEMO_BUSINESS_PASSWORD');

        const businessUser = await User.create({
          username: 'abcrestaurant',
          password: demoPassword,
          email: 'owner@abcrestaurant.com',
          fullName: 'Marco Rossi',
          role: 'business',
          isActive: true,
        });

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

        await NfcCard.create([
          {
            cardId: 'card_8F72K',
            label: 'Main Counter',
            business: business._id,
            destinationUrl: 'https://g.page/r/abc-restaurant-review',
            type: 'both',
            isActive: true,
          },
          {
            cardId: 'card_3M91P',
            label: 'Table 1',
            business: business._id,
            destinationUrl: 'https://g.page/r/abc-restaurant-review',
            type: 'both',
            isActive: true,
          },
          {
            cardId: 'card_7K24Q',
            label: 'Table 2',
            business: business._id,
            destinationUrl: 'https://g.page/r/abc-restaurant-review',
            type: 'both',
            isActive: true,
          },
          {
            cardId: 'card_5R88T',
            label: 'Takeaway Counter',
            business: business._id,
            destinationUrl: 'https://g.page/r/abc-restaurant-takeaway',
            type: 'both',
            isActive: true,
          },
        ]);

        console.log('✓ Demo business "ABC Restaurant" created with 4 NFC cards');
        console.log(`  Login: username=abcrestaurant, password=${demoPassword}`);
      } else {
        console.log('✓ Demo business already exists — skipping');
      }
    } else {
      console.log('ℹ️  SEED_DEMO_DATA is not "true" — skipping demo business/cards (recommended for production)');
    }

    // ============================================
    // PRODUCT CATALOG (safe to always seed)
    // ============================================
    const productExists = await Product.findOne({});
    if (!productExists) {
      await Product.create([
        { name: 'Starter Pack', slug: 'starter', price: 449, currency: 'BDT', cardCount: 1, cardType: 'both', description: '1 NFC card + QR code' },
        { name: 'Professional Pack', slug: 'professional', price: 2000, currency: 'BDT', cardCount: 5, cardType: 'both', description: '5 NFC cards + QR codes — save ৳245' },
        { name: 'Enterprise Pack', slug: 'enterprise', price: 3500, currency: 'BDT', cardCount: 10, cardType: 'both', description: '10 NFC cards + QR codes — save ৳990' },
      ]);
      console.log('✓ Products created');
    } else {
      console.log('✓ Products already exist — skipping');
    }

    console.log('\n═══════════════════════════════════════');
    console.log('  Seed complete!');
    console.log('═══════════════════════════════════════\n');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Seed error:', error);
    process.exit(1);
  }
}

seed();