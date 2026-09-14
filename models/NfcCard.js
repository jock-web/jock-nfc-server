import mongoose from 'mongoose';
import validator from 'validator';

const nfcCardSchema = new mongoose.Schema({
  // Unique card identifier (encoded in NFC chip)
  cardId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  // Human-readable label (e.g., "Main Counter", "Table 1")
  label: {
    type: String,
    trim: true,
    maxlength: 50,
  },
  // Reference to business
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true,
  },
  // The destination URL - THIS IS WHAT BUSINESS OWNER CAN CHANGE
  // The NFC card always points to: tapreview.com/s/{cardId}
  // But the cardId resolves to this destinationUrl
  destinationUrl: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: (value) => {
        try {
          const url = new URL(value);
          // Only allow http and https protocols (prevent javascript: attacks)
          return url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
          return false;
        }
      },
      message: 'Destination URL must be a valid HTTP or HTTPS URL',
    },
  },
  // Card type
  type: {
    type: String,
    enum: ['nfc', 'qr', 'both'],
    default: 'both',
  },
  // Status
  isActive: {
    type: Boolean,
    default: true,
  },
  // Physical card info
  physicalCard: {
    serialNumber: String,
    manufacturingDate: Date,
    shippedDate: Date,
    deliveredDate: Date,
  },
  // Scan statistics (cached for performance)
  stats: {
    totalScans: { type: Number, default: 0 },
    todayScans: { type: Number, default: 0 },
    weekScans: { type: Number, default: 0 },
    monthScans: { type: Number, default: 0 },
    lastScannedAt: Date,
  },
  // Custom redirect page settings
  redirectPage: {
    enabled: { type: Boolean, default: false },
    title: String,
    message: String,
    backgroundColor: { type: String, default: '#ffffff' },
    showAfterSeconds: { type: Number, default: 0 },
  },
  // Order reference
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
  },
}, {
  timestamps: true,
});

// CRITICAL INDEX: Fast lookup for NFC redirect
nfcCardSchema.index({ cardId: 1, isActive: 1 });
nfcCardSchema.index({ business: 1 });

// Method to validate destination URL safety
nfcCardSchema.methods.isDestinationSafe = function() {
  try {
    const url = new URL(this.destinationUrl);
    const allowedProtocols = ['http:', 'https:'];
    return allowedProtocols.includes(url.protocol);
  } catch {
    return false;
  }
};

const NfcCard = mongoose.model('NfcCard', nfcCardSchema);
export default NfcCard;
