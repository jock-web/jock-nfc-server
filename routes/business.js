import express from 'express';
import Business from '../models/Business.js';
import NfcCard from '../models/NfcCard.js';
import { protect, businessOnly } from '../middleware/auth.js';
import { invalidateCache } from './redirect.js';
import { validate } from '../middleware/validate.js';
import { audit } from '../utils/audit.js';
import { success, failure } from '../utils/response.js';

const router = express.Router();

// ============================================
// GET /api/businesses/my
// Get current business owner's business
// ============================================
router.get('/my', protect, businessOnly, async (req, res) => {
  try {
    const business = await Business.findOne({ owner: req.user._id });

    if (!business) {
      return failure(res, 'Business not found', 404);
    }

    return success(res, { business });
  } catch (error) {
    console.error('Get business error:', error);
    return failure(res, 'Server error', 500);
  }
});

// ============================================
// PUT /api/businesses/my
// Update business details
// ============================================
router.put('/my', protect, businessOnly, validate('updateBusiness'), async (req, res) => {
  try {
    const allowedFields = ['name', 'description', 'phone', 'website', 'address', 'logo', 'coverImage'];
    const updates = {};

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const business = await Business.findOneAndUpdate(
      { owner: req.user._id },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!business) {
      return failure(res, 'Business not found', 404);
    }

    return success(res, { business, message: 'Business updated successfully' });
  } catch (error) {
    console.error('Update business error:', error);
    return failure(res, 'Server error', 500);
  }
});

router.put('/my/card-design', protect, businessOnly, validate('updateCardDesign'), async (req, res) => {
  try {
    const business = await Business.findOne({ owner: req.user._id });
    if (!business) return failure(res, 'Business not found', 404);

    const previousValues = business.cardDesign?.toObject?.() || business.cardDesign;
    business.cardDesign = req.body;
    await business.save();

    await audit(req, {
      action: 'design_changed',
      targetType: 'business',
      targetId: business._id.toString(),
      details: { type: 'card_design_changed' },
      previousValues,
      newValues: req.body,
    });

    return success(res, { business, message: 'Card design saved' });
  } catch (error) {
    return failure(res, error.message, error.name === 'ValidationError' ? 400 : 500);
  }
});

// ============================================
// GET /api/businesses/my/cards
// Get all NFC cards for this business
// ============================================
router.get('/my/cards', protect, businessOnly, async (req, res) => {
  try {
    const business = await Business.findOne({ owner: req.user._id });

    if (!business) {
      return failure(res, 'Business not found', 404);
    }

    const cards = await NfcCard.find({ business: business._id })
      .sort({ createdAt: -1 });

    return success(res, { cards });
  } catch (error) {
    console.error('Get cards error:', error);
    return failure(res, 'Server error', 500);
  }
});

// ============================================
// PUT /api/businesses/cards/:cardId/destination
// ★ CORE FEATURE: Change NFC card destination URL
// This is what business owners use to update where
// their NFC card redirects to WITHOUT replacing the card
// ============================================
router.put('/cards/:cardId/destination', protect, businessOnly, validate('updateDestination'), async (req, res) => {
  try {
    const { cardId } = req.params;
    const { destinationUrl } = req.body;

    if (!destinationUrl) {
      return failure(res, 'Destination URL is required', 400);
    }

    // Validate URL format
    let parsedUrl;
    try {
      parsedUrl = new URL(destinationUrl);
    } catch {
      return failure(res, 'Invalid URL format', 400);
    }

    // Security: Only allow http/https (prevent javascript:, data:, etc.)
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return failure(res, 'Only HTTP and HTTPS URLs are allowed', 400);
    }

    // Get business
    const business = await Business.findOne({ owner: req.user._id });
    if (!business) {
      return failure(res, 'Business not found', 404);
    }

    // Find card belonging to this business
    const card = await NfcCard.findOne({
      cardId,
      business: business._id
    });

    if (!card) {
      return failure(res, 'Card not found', 404);
    }

    // Update destination URL
    const previousUrl = card.destinationUrl;
    card.destinationUrl = destinationUrl;
    await card.save();

    // CRITICAL: Invalidate redirect cache so new URL takes effect immediately
    invalidateCache(cardId);

    await audit(req, {
      action: 'destination_changed',
      targetType: 'card',
      targetId: card._id.toString(),
      previousValues: { destinationUrl: previousUrl },
      newValues: { destinationUrl },
    });

    return success(res, {
      message: 'Destination URL updated successfully',
      card: {
        cardId: card.cardId,
        label: card.label,
        destinationUrl: card.destinationUrl,
        nfcUrl: `${process.env.FRONTEND_URL || 'https://tapreview.com'}/s/${card.cardId}`,
      },
    });
  } catch (error) {
    console.error('Update destination error:', error);
    if (error.name === 'ValidationError') {
      return failure(res, error.message, 400);
    }
    return failure(res, 'Server error', 500);
  }
});

// ============================================
// PUT /api/businesses/cards/:cardId
// Update card label/settings
// ============================================
router.put('/cards/:cardId', protect, businessOnly, validate('updateCard'), async (req, res) => {
  try {
    const { cardId } = req.params;
    const { label, isActive } = req.body;

    const business = await Business.findOne({ owner: req.user._id });
    if (!business) {
      return failure(res, 'Business not found', 404);
    }

    const card = await NfcCard.findOne({ cardId, business: business._id });
    if (!card) {
      return failure(res, 'Card not found', 404);
    }

    const previousActive = card.isActive;
    if (label !== undefined) card.label = label;
    if (isActive !== undefined) card.isActive = isActive;

    await card.save();

    // CRITICAL: Invalidate redirect cache so activate/deactivate takes
    // effect immediately instead of waiting out the cache TTL.
    if (isActive !== undefined && previousActive !== isActive) {
      invalidateCache(cardId);

      await audit(req, {
        action: isActive ? 'card_activated' : 'card_deactivated',
        targetType: 'card',
        targetId: card._id.toString(),
        previousValues: { isActive: previousActive },
        newValues: { isActive },
      });
    }

    return success(res, { card, message: 'Card updated successfully' });
  } catch (error) {
    console.error('Update card error:', error);
    return failure(res, 'Server error', 500);
  }
});

// ============================================
// GET /api/businesses/my/quick-stats
// Quick stats for dashboard
// ============================================
router.get('/my/quick-stats', protect, businessOnly, async (req, res) => {
  try {
    const business = await Business.findOne({ owner: req.user._id });
    if (!business) {
      return failure(res, 'Business not found', 404);
    }

    const cards = await NfcCard.find({ business: business._id });

    const totalScans = cards.reduce((sum, card) => sum + (card.stats?.totalScans || 0), 0);
    const todayScans = cards.reduce((sum, card) => sum + (card.stats?.todayScans || 0), 0);
    const weekScans = cards.reduce((sum, card) => sum + (card.stats?.weekScans || 0), 0);

    return success(res, {
      totalScans,
      todayScans,
      weekScans,
      totalCards: cards.length,
      activeCards: cards.filter(c => c.isActive).length,
    });
  } catch (error) {
    console.error('Quick stats error:', error);
    return failure(res, 'Server error', 500);
  }
});

export default router;