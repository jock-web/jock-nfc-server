import express from 'express';
import User from '../models/User.js';
import Business from '../models/Business.js';
import NfcCard from '../models/NfcCard.js';
import { Order, Product } from '../models/Order.js';
import ScanEvent from '../models/ScanEvent.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { audit } from '../utils/audit.js';
import { success, failure } from '../utils/response.js';
import { invalidateCache } from './redirect.js';

const router = express.Router();

const provisionOrderCards = async (order) => {
  if (!order.business || !order.items?.length) return [];

  const business = order.business;
  const existingCards = await NfcCard.countDocuments({ order: order._id });
  const requestedCards = order.items.reduce(
    (total, item) => total + ((item.product?.cardCount || 1) * item.quantity),
    0,
  );
  const cardsToCreate = Math.max(requestedCards - existingCards, 0);
  if (!cardsToCreate) return [];

  const destinationUrl = business.website || `https://www.google.com/search?q=${encodeURIComponent(business.name)}`;
  const cards = Array.from({ length: cardsToCreate }, (_, index) => {
    const cardId = `TR-${order.orderNumber}-${existingCards + index + 1}`.toLowerCase();
    return {
      cardId,
      label: `${business.name} Card ${existingCards + index + 1}`,
      business: business._id,
      destinationUrl,
      order: order._id,
    };
  });

  return NfcCard.insertMany(cards, { ordered: true });
};

// All admin routes require admin role
router.use(protect, adminOnly);

// ============================================
// ADMIN DASHBOARD STATS
// ============================================
router.get('/stats', async (req, res) => {
  try {
    const [totalBusinesses, totalUsers, totalCards, totalOrders, totalScans] = await Promise.all([
      Business.countDocuments(),
      User.countDocuments({ role: 'business' }),
      NfcCard.countDocuments(),
      Order.countDocuments(),
      ScanEvent.countDocuments(),
    ]);

    const revenue = await Order.aggregate([
      { $match: { 'payment.status': 'completed' } },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ]);

    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('customer', 'fullName email')
      .populate('business', 'name');

    return success(res, {
      stats: {
        totalBusinesses,
        totalUsers,
        totalCards,
        totalOrders,
        totalScans,
        totalRevenue: revenue[0]?.total || 0,
      },
      recentOrders,
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    return failure(res, 'Server error', 500);
  }
});

// ============================================
// BUSINESS MANAGEMENT
// ============================================

// GET /api/admin/businesses - List all businesses
router.get('/businesses', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } },
      ];
    }
    if (status === 'active') query.isActive = true;
    if (status === 'suspended') query.isSuspended = true;

    const businesses = await Business.find(query)
      .populate('owner', 'username email fullName')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Business.countDocuments(query);

    return success(res, { businesses, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    return failure(res, 'Server error', 500);
  }
});

// POST /api/admin/businesses - Admin creates new business + account
router.post('/businesses', validate('createBusiness'), async (req, res) => {
  let user;

  try {
    const { username, password, email, fullName, businessName, category } = req.body;

    // Validate required fields
    if (!username || !password || !email || !fullName || !businessName || !category) {
      return failure(res, 'All fields are required', 400);
    }

    // Check existing
    const normalizedUsername = username.toLowerCase().trim();
    const normalizedEmail = email.toLowerCase().trim();
    const slug = businessName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    if (!slug) {
      return failure(res, 'Business name must contain letters or numbers', 400);
    }

    const [existing, existingBusiness] = await Promise.all([
      User.findOne({
        $or: [{ username: normalizedUsername }, { email: normalizedEmail }]
      }),
      Business.findOne({ slug }),
    ]);

    if (existing) {
      return failure(res, 'Username or email already exists', 400);
    }
    if (existingBusiness) {
      return failure(res, 'A business with this name already exists', 400);
    }

    // Create user account (admin sets credentials)
    user = await User.create({
      username: normalizedUsername,
      password, // Will be hashed by pre-save hook
      email: normalizedEmail,
      fullName: fullName.trim(),
      role: 'business',
      createdBy: req.user._id,
    });

    // Create business
    const business = await Business.create({
      name: businessName.trim(),
      slug,
      category,
      owner: user._id,
    });

    await audit(req, {
      action: 'business_created',
      targetType: 'business',
      targetId: business._id.toString(),
      newValues: { name: business.name, slug: business.slug, owner: business.owner },
    });

    // Note: we deliberately do NOT echo the plaintext password back here.
    // The admin already knows it (they just typed it) — returning it in the
    // response risks it ending up in logs, browser history, or screenshots.
    return success(res, {
      message: 'Business and account created',
      business,
      credentials: { username: user.username, email: user.email },
    }, 201);
  } catch (error) {
    console.error('Admin create business error:', error);
    if (user) {
      await User.findByIdAndDelete(user._id).catch((cleanupError) => {
        console.error('Admin create business cleanup error:', cleanupError);
      });
    }
    if (error.code === 11000) {
      return failure(res, 'Username, email, or business name already exists', 400);
    }
    if (error.name === 'ValidationError') {
      return failure(
        res,
        Object.values(error.errors).map((validationError) => validationError.message).join(', '),
        400
      );
    }
    return failure(res, 'Server error', 500);
  }
});

// PUT /api/admin/businesses/:id - Update business
router.put('/businesses/:id', validate('updateBusinessAdmin'), async (req, res) => {
  try {
    const { isActive, isSuspended, suspendedReason, plan } = req.body;

    const business = await Business.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive, isSuspended, suspendedReason, plan } },
      { new: true }
    );

    if (!business) return failure(res, 'Business not found', 404);

    // CRITICAL: Invalidate every cached card for this business immediately.
    // Without this, a suspended business's cards keep redirecting for up to
    // REDIRECT_CACHE_TTL seconds because the cached hit path in redirect.js
    // never re-checks isSuspended.
    const businessCards = await NfcCard.find({ business: business._id }).select('cardId');
    businessCards.forEach((card) => invalidateCache(card.cardId));

    await audit(req, {
      action: isSuspended ? 'business_suspended' : isActive === false ? 'business_suspended' : 'business_activated',
      targetType: 'business',
      targetId: business._id.toString(),
      newValues: req.body,
    });

    return success(res, { business, message: 'Business updated' });
  } catch (error) {
    return failure(res, 'Server error', 500);
  }
});

// PUT /api/admin/businesses/:id/card-design - Save printable card design
router.put('/businesses/:id/card-design', validate('updateCardDesign'), async (req, res) => {
  try {
    const { title, subtitle, colors } = req.body;
    const business = await Business.findByIdAndUpdate(
      req.params.id,
      { $set: { cardDesign: { title, subtitle, colors } } },
      { new: true, runValidators: true },
    );

    if (!business) return failure(res, 'Business not found', 404);

    await audit(req, {
      action: 'design_changed',
      targetType: 'business',
      targetId: business._id.toString(),
      newValues: req.body,
    });

    return success(res, { business, message: 'Card design saved' });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return failure(res, error.message, 400);
    }
    return failure(res, 'Server error', 500);
  }
});

// DELETE /api/admin/businesses/:id
router.delete('/businesses/:id', async (req, res) => {
  try {
    const business = await Business.findById(req.params.id);
    if (!business) return failure(res, 'Business not found', 404);

    // Invalidate any cached redirects for this business's cards before
    // deleting them, so nothing serves a stale cached hit afterward.
    const businessCards = await NfcCard.find({ business: business._id }).select('cardId');
    businessCards.forEach((card) => invalidateCache(card.cardId));

    // Delete associated data
    await Promise.all([
      NfcCard.deleteMany({ business: business._id }),
      User.findByIdAndDelete(business.owner),
      Business.findByIdAndDelete(business._id),
    ]);

    await audit(req, {
      action: 'business_deleted',
      targetType: 'business',
      targetId: business._id.toString(),
      previousValues: { name: business.name, slug: business.slug },
    });

    return success(res, { message: 'Business and associated data deleted' });
  } catch (error) {
    return failure(res, 'Server error', 500);
  }
});

// ============================================
// NFC CARD MANAGEMENT
// ============================================

// GET /api/admin/cards - All cards
router.get('/cards', async (req, res) => {
  try {
    const cards = await NfcCard.find()
      .populate('business', 'name slug')
      .sort({ createdAt: -1 });
    return success(res, { cards });
  } catch (error) {
    return failure(res, 'Server error', 500);
  }
});

// POST /api/admin/cards - Admin creates/assigns NFC card
router.post('/cards', validate('createCard'), async (req, res) => {
  try {
    const { cardId, businessId, destinationUrl, label } = req.body;

    const business = await Business.findById(businessId);
    if (!business) return failure(res, 'Business not found', 404);

    const card = await NfcCard.create({
      cardId,
      business: business._id,
      destinationUrl,
      label,
    });

    await audit(req, {
      action: 'card_created',
      targetType: 'card',
      targetId: card._id.toString(),
      newValues: { cardId, business: business._id, label },
    });

    return success(res, { card, message: 'Card created and assigned' }, 201);
  } catch (error) {
    if (error.code === 11000) {
      return failure(res, 'Card ID already exists', 400);
    }
    return failure(res, 'Server error', 500);
  }
});

// PUT /api/admin/cards/:id - Admin updates card
router.put('/cards/:id', validate('updateAdminCard'), async (req, res) => {
  try {
    const { isActive, destinationUrl, label } = req.body;
    const previousCard = await NfcCard.findById(req.params.id);
    if (!previousCard) return failure(res, 'Card not found', 404);

    const card = await NfcCard.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive, destinationUrl, label } },
      { new: true, runValidators: true }
    );
    if (!card) return failure(res, 'Card not found', 404);

    // CRITICAL: Invalidate the redirect cache for this card whenever an
    // admin changes its destination or active status — otherwise the
    // change silently doesn't take effect until the cache TTL expires.
    if (
      (destinationUrl && destinationUrl !== previousCard.destinationUrl) ||
      (isActive !== undefined && isActive !== previousCard.isActive)
    ) {
      invalidateCache(card.cardId);
    }

    if (destinationUrl && destinationUrl !== previousCard.destinationUrl) {
      await audit(req, {
        action: 'destination_changed',
        targetType: 'card',
        targetId: card._id.toString(),
        previousValues: { destinationUrl: previousCard.destinationUrl },
        newValues: { destinationUrl },
      });
    }
    if (isActive !== undefined && isActive !== previousCard.isActive) {
      await audit(req, {
        action: isActive ? 'card_activated' : 'card_deactivated',
        targetType: 'card',
        targetId: card._id.toString(),
        previousValues: { isActive: previousCard.isActive },
        newValues: { isActive },
      });
    }

    return success(res, { card });
  } catch (error) {
    return failure(res, 'Server error', 500);
  }
});

// ============================================
// ORDER MANAGEMENT
// ============================================

router.get('/orders', async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = status ? { status } : {};

    const orders = await Order.find(query)
      .populate('customer', 'fullName email')
      .populate('business', 'name')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Order.countDocuments(query);
    return success(res, { orders, total });
  } catch (error) {
    return failure(res, 'Server error', 500);
  }
});

router.put('/orders/:id/status', validate('updateOrderStatus'), async (req, res) => {
  try {
    const { status, trackingNumber, trackingUrl, adminNotes } = req.body;
    const allowedStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!allowedStatuses.includes(status)) {
      return failure(res, 'Invalid order status', 400);
    }
    const order = await Order.findById(req.params.id)
      .populate('business', 'name website')
      .populate('items.product', 'cardCount');
    if (!order) return failure(res, 'Order not found', 404);

    order.status = status;
    order.trackingNumber = trackingNumber;
    order.trackingUrl = trackingUrl;
    order.adminNotes = adminNotes;
    await order.save();

    if (status === 'processing') {
      await audit(req, {
        action: 'order_approved',
        targetType: 'order',
        targetId: order._id.toString(),
        newValues: { status },
      });
    }

    if (status === 'delivered') {
      await provisionOrderCards(order);
      await audit(req, {
        action: 'order_delivered',
        targetType: 'order',
        targetId: order._id.toString(),
        newValues: { status },
      });
    }

    return success(res, { order, message: 'Order status updated' });
  } catch (error) {
    return failure(res, 'Server error', 500);
  }
});

// ============================================
// USER MANAGEMENT
// ============================================

router.get('/users', async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 });
    return success(res, { users });
  } catch (error) {
    return failure(res, 'Server error', 500);
  }
});

router.put('/users/:id', validate('updateUser'), async (req, res) => {
  try {
    const { isActive, role } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive, role } },
      { new: true }
    ).select('-password');

    if (!user) return failure(res, 'User not found', 404);

    await audit(req, {
      action: 'user_updated',
      targetType: 'user',
      targetId: user._id.toString(),
      newValues: { isActive, role },
    });

    return success(res, { user });
  } catch (error) {
    return failure(res, 'Server error', 500);
  }
});

export default router;