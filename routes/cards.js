import express from 'express';
import NfcCard from '../models/NfcCard.js';
import Business from '../models/Business.js';
import { protect, businessOnly } from '../middleware/auth.js';
import { success, failure } from '../utils/response.js';

const router = express.Router();

// GET /api/cards - Get cards for current business
router.get('/', protect, businessOnly, async (req, res) => {
  try {
    const business = await Business.findOne({ owner: req.user._id });
    if (!business) return failure(res, 'Business not found', 404);

    const cards = await NfcCard.find({ business: business._id }).sort({ createdAt: -1 });
    return success(res, { cards });
  } catch (error) {
    return failure(res, 'Server error', 500);
  }
});

// GET /api/cards/:cardId - Get single card
router.get('/:cardId', protect, businessOnly, async (req, res) => {
  try {
    const business = await Business.findOne({ owner: req.user._id });
    if (!business) return failure(res, 'Business not found', 404);

    const card = await NfcCard.findOne({ cardId: req.params.cardId, business: business._id });

    if (!card) return failure(res, 'Card not found', 404);
    return success(res, { card });
  } catch (error) {
    return failure(res, 'Server error', 500);
  }
});

export default router;