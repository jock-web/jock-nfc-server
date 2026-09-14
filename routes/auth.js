import express from 'express';
import crypto from 'crypto';
import User from '../models/User.js';
import { generateToken, protect, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { success, failure } from '../utils/response.js';
import { audit } from '../utils/audit.js';

const router = express.Router();

const sendSuccess = (res, payload = {}, status = 200) => {
  return res.status(status).json({ success: true, ...payload });
};

const sendError = (res, message, status = 400, details = null) => {
  const body = { success: false, error: message };
  return res.status(status).json(body);
};

// ============================================
// POST /api/auth/login
// Business owner logs in with admin-set credentials
// ============================================
router.post('/login', validate('login'), async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return failure(res, 'Username and password are required', 400);
    }

    // Find user by username (admin-set)
    const user = await User.findOne({
      username: username.toLowerCase().trim()
    });

    if (!user) {
      return failure(res, 'Invalid credentials', 401);
    }

    // Check if account is active
    if (!user.isActive) {
      return failure(res, 'Account has been deactivated. Contact admin.', 403);
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return failure(res, 'Invalid credentials', 401);
    }

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    // Set cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    await audit(req, { action: 'user_login', targetType: 'user', targetId: user._id.toString() });
    return success(res, {
        message: 'Login successful',
        token,
        user: user.toJSON(),
    });
  } catch (error) {
    console.error('Login error:', error);
    return failure(res, 'Server error during login', 500);
  }
});

// ============================================
// POST /api/auth/register
// Admin creates new business account
// (Only admin can create accounts)
// ============================================
router.post('/register', protect, adminOnly, validate('register'), async (req, res) => {
  try {
    const { username, password, email, fullName, businessName, category } = req.body;

    // Validation
    if (!username || !password || !email || !fullName) {
      return sendError(res, 'All fields are required', 400);
    }

    // Check if username exists
    const existingUser = await User.findOne({
      $or: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }]
    });

    if (existingUser) {
      return sendError(res, 'Username or email already exists', 400);
    }

    // Create user (password will be hashed by pre-save hook)
    const user = await User.create({
      username: username.toLowerCase().trim(),
      password,
      email: email.toLowerCase().trim(),
      fullName: fullName.trim(),
      role: 'business',
      createdBy: req.user._id,
    });

    // If business info provided, create business too
    if (businessName && category) {
      const Business = (await import('../models/Business.js')).default;
      const slug = businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

      await Business.create({
        name: businessName,
        slug,
        category,
        owner: user._id,
      });
    }

    await audit(req, { action: 'user_created', targetType: 'user', targetId: user._id.toString() });
    return success(res, {
        message: 'Business account created successfully',
        user: user.toJSON(),
    }, 201);
  } catch (error) {
    console.error('Register error:', error);
    if (error.code === 11000) {
      return sendError(res, 'Username or email already exists', 400);
    }
    return failure(res, 'Server error during registration', 500);
  }
});

// ============================================
// POST /api/auth/logout
// ============================================
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  return success(res, { message: 'Logged out successfully' });
});

// ============================================
// GET /api/auth/me
// Get current user profile
// ============================================
router.get('/me', protect, async (req, res) => {
  return success(res, { user: req.user.toJSON() });
});

// ============================================
// POST /api/auth/forgot-password
// Admin initiates password reset for business
// ============================================
router.post('/forgot-password', protect, adminOnly, validate('forgotPassword'), async (req, res) => {
  try {
    const { username } = req.body;

    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      return failure(res, 'User not found', 404);
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetExpires = Date.now() + 30 * 60 * 1000; // 30 minutes
    await user.save();

    // In production: send email with reset link
    // For now, return token (admin would share with business owner)
    await audit(req, { action: 'password_reset_requested', targetType: 'user', targetId: user._id.toString() });
    return success(res, {
        message: 'Password reset initiated',
        resetToken,
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return failure(res, 'Server error', 500);
  }
});

// ============================================
// POST /api/auth/reset-password
// Business owner resets password with token
// ============================================
router.post('/reset-password', validate('resetPassword'), async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return failure(res, 'Token and new password are required', 400);
    }

    if (newPassword.length < 6) {
      return failure(res, 'Password must be at least 6 characters', 400);
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return failure(res, 'Invalid or expired reset token', 400);
    }

    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    return success(res, { message: 'Password reset successful' });
  } catch (error) {
    console.error('Reset password error:', error);
    return failure(res, 'Server error', 500);
  }
});

// ============================================
// PUT /api/auth/change-password
// Business owner changes their own password
// ============================================
router.put('/change-password', protect, validate('changePassword'), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return failure(res, 'Current and new password are required', 400);
    }

    if (newPassword.length < 6) {
      return failure(res, 'New password must be at least 6 characters', 400);
    }

    const user = await User.findById(req.user._id);
    const isMatch = await user.comparePassword(currentPassword);

    if (!isMatch) {
      return failure(res, 'Current password is incorrect', 400);
    }

    user.password = newPassword;
    await user.save();

    await audit(req, { action: 'password_changed', targetType: 'user', targetId: user._id.toString() });
    return success(res, { message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    return failure(res, 'Server error', 500);
  }
});

export default router;
