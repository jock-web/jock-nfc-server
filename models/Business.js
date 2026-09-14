import mongoose from 'mongoose';

const businessSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  // URL-friendly slug for NFC links: tapreview.com/s/abc-restaurant
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  },
  category: {
    type: String,
    enum: [
      'restaurant', 'cafe', 'salon', 'hotel', 'shop',
      'clinic', 'gym', 'barber', 'spa', 'other'
    ],
    required: true,
  },
  description: {
    type: String,
    maxlength: 500,
  },
  // Business owner reference
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  // Contact info
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: { type: String, default: 'US' },
  },
  phone: {
    type: String,
    trim: true,
  },
  website: {
    type: String,
    trim: true,
  },
  // Branding
  logo: {
    type: String, // URL to uploaded logo
  },
  cardDesign: {
    title: { type: String, default: 'TAP OR SCAN', maxlength: 24 },
    subtitle: { type: String, default: 'review us on Google', maxlength: 30 },
    colors: {
      c1: { type: String, default: '#34A853' },
      c2: { type: String, default: '#FBBC05' },
      c3: { type: String, default: '#4285F4' },
      c4: { type: String, default: '#EA4335' },
    },
  },
  coverImage: {
    type: String, // URL to uploaded cover
  },
  // Status
  isActive: {
    type: Boolean,
    default: true,
  },
  isSuspended: {
    type: Boolean,
    default: false,
  },
  suspendedReason: {
    type: String,
  },
  // Subscription tier
  plan: {
    type: String,
    enum: ['free', 'starter', 'professional', 'enterprise'],
    default: 'free',
  },
  // Analytics retention (days)
  analyticsRetentionDays: {
    type: Number,
    default: 90,
  },
}, {
  timestamps: true,
});

// Indexes for performance
businessSchema.index({ owner: 1 });
businessSchema.index({ category: 1 });
businessSchema.index({ isActive: 1 });

const Business = mongoose.model('Business', businessSchema);
export default Business;
