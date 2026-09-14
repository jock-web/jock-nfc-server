import mongoose from 'mongoose';

const scanEventSchema = new mongoose.Schema({
  card: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'NfcCard',
    required: true,
  },
  business: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true,
  },
  // Device/Browser info
  userAgent: {
    type: String,
    maxlength: 500,
  },
  device: {
    type: String, // mobile, tablet, desktop
    enum: ['mobile', 'tablet', 'desktop', 'unknown'],
    default: 'unknown',
  },
  os: {
    type: String, // iOS, Android, Windows, macOS
  },
  browser: {
    type: String, // Chrome, Safari, Firefox
  },
  // Approximate location (privacy-aware)
  location: {
    country: String,
    region: String,
    city: String,
    // No precise coordinates stored (privacy)
  },
  // IP hash for unique visitor detection (not raw IP)
  visitorHash: {
    type: String,
    required: true,
  },
  // Scan source
  source: {
    type: String,
    enum: ['nfc', 'qr', 'direct', 'unknown'],
    default: 'unknown',
  },
  // Whether this is estimated unique visitor
  isUniqueVisitor: {
    type: Boolean,
    default: false,
  },
  // Referrer
  referrer: {
    type: String,
    maxlength: 500,
  },
  // Timestamp
    timestamp: {
      type: Date,
      default: Date.now,
    },
}, {
  timestamps: false, // We use custom 'timestamp' field
});

// CRITICAL INDEXES for analytics queries
scanEventSchema.index({ card: 1, timestamp: -1 });
scanEventSchema.index({ business: 1, timestamp: -1 });
scanEventSchema.index({ timestamp: -1 });
scanEventSchema.index({ visitorHash: 1, card: 1, timestamp: -1 });

// TTL index: Auto-delete old scan events (configurable per business plan)
// Default: 90 days retention
scanEventSchema.index({ timestamp: 1 }, { 
  expireAfterSeconds: 90 * 24 * 60 * 60,
  partialFilterExpression: { timestamp: { $exists: true } }
});

const ScanEvent = mongoose.model('ScanEvent', scanEventSchema);
export default ScanEvent;
