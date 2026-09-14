import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  // Admin sets these credentials for business users
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    minlength: 3,
    maxlength: 50,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  fullName: {
    type: String,
    required: true,
    trim: true,
  },
  role: {
    type: String,
    enum: ['admin', 'business'],
    default: 'business',
  },
  // Admin can set account status
  isActive: {
    type: Boolean,
    default: true,
  },
  // Track who created this account (admin)
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  lastLoginAt: {
    type: Date,
  },
  passwordResetToken: String,
  passwordResetExpires: Date,
}, {
  timestamps: true,
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  return obj;
};

const User = mongoose.model('User', userSchema);
export default User;
