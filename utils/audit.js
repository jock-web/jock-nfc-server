import AuditLog from '../models/AuditLog.js';

export const audit = (req, data) => AuditLog.log({
  ...data,
  userId: req.user?._id,
  userEmail: req.user?.email,
  userRole: req.user?.role,
  ipAddress: req.ip || req.connection?.remoteAddress || 'unknown',
  userAgent: req.get('user-agent'),
});
