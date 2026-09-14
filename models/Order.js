import mongoose from 'mongoose';

// ============================================
// PRODUCT MODEL
// ============================================
const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  description: {
    type: String,
    maxlength: 1000,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  currency: {
    type: String,
    default: 'BDT',
  },
  // Card type included
  cardType: {
    type: String,
    enum: ['nfc', 'qr', 'both'],
    default: 'both',
  },
  cardCount: {
    type: Number,
    required: true,
    min: 1,
  },
  // Customization options
  customization: {
    logo: { type: Boolean, default: true },
    color: { type: Boolean, default: true },
    text: { type: Boolean, default: true },
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  stock: {
    type: Number,
    default: -1, // -1 = unlimited
  },
}, {
  timestamps: true,
});

// ============================================
// ORDER MODEL
// ============================================
const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    required: true,
    unique: true,
  },
  // Customer info
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
  },
  // Items
  items: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    price: {
      type: Number,
      required: true,
    },
    customization: {
      businessName: String,
      logo: String,
      color: String,
      cardLabel: String,
    },
  }],
  // Pricing
  subtotal: {
    type: Number,
    required: true,
  },
  discount: {
    type: Number,
    default: 0,
  },
  discountCode: String,
  shippingCost: {
    type: Number,
    default: 0,
  },
  total: {
    type: Number,
    required: true,
  },
  // Shipping
  shippingAddress: {
    fullName: { type: String, required: true },
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zipCode: { type: String, required: true },
    country: { type: String, default: 'US' },
    phone: String,
  },
  // Status
  status: {
    type: String,
    enum: ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
    default: 'pending',
  },
  // Payment
  payment: {
    method: {
      type: String,
      enum: ['stripe', 'paypal', 'cod', 'bank_transfer'],
    },
    transactionId: String,
    paidAt: Date,
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed', 'refunded'],
      default: 'pending',
    },
  },
  // Tracking
  trackingNumber: String,
  trackingUrl: String,
  // Notes
  notes: String,
  adminNotes: String,
}, {
  timestamps: true,
});

// Indexes
orderSchema.index({ customer: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });

const Product = mongoose.model('Product', productSchema);
const Order = mongoose.model('Order', orderSchema);

export { Product, Order };
