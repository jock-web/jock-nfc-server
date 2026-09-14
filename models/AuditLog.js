import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: [
        'user_login',
        'user_logout',
        'user_created',
        'user_updated',
        'user_deleted',
        'business_created',
        'business_updated',
        'business_deleted',
        'business_suspended',
        'business_activated',
        'card_created',
        'card_updated',
        'card_deleted',
        'card_activated',
        'card_deactivated',
        'destination_changed',
        'design_changed',
        'order_approved',
        'order_delivered',
        'order_created',
        'order_updated',
        'order_status_changed',
        'payment_processed',
        'password_reset_requested',
        'password_changed',
        'admin_action',
      ],
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    userEmail: {
      type: String,
      trim: true,
    },
    userRole: {
      type: String,
      enum: ['admin', 'business'],
    },
    targetType: {
      type: String,
      enum: ['user', 'business', 'card', 'order', 'scan'],
    },
    targetId: {
      type: String,
      index: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
    },
    previousValues: {
      type: mongoose.Schema.Types.Mixed,
    },
    newValues: {
      type: mongoose.Schema.Types.Mixed,
    },
    ipAddress: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
    },
    success: {
      type: Boolean,
      default: true,
    },
    errorMessage: {
      type: String,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
    collection: 'audit_logs',
  }
);

// Indexes for efficient querying
auditLogSchema.index({ userId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1 });
auditLogSchema.index({ timestamp: -1 });

// Auto-delete logs after 1 year (GDPR compliance)
auditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

// Static method to create audit log
auditLogSchema.statics.log = async function (data) {
  try {
    const log = await this.create({
      action: data.action,
      userId: data.userId,
      userEmail: data.userEmail,
      userRole: data.userRole,
      targetType: data.targetType,
      targetId: data.targetId,
      details: data.details,
      previousValues: data.previousValues,
      newValues: data.newValues,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      success: data.success !== false,
      errorMessage: data.errorMessage,
    });
    return log;
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw error - audit logging failure shouldn't break the app
  }
};

// Static method to get audit logs for a user
auditLogSchema.statics.getUserLogs = async function (userId, limit = 50) {
  return this.find({ userId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();
};

// Static method to get audit logs for a target
auditLogSchema.statics.getTargetLogs = async function (targetType, targetId, limit = 50) {
  return this.find({ targetType, targetId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();
};

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

export default AuditLog;
