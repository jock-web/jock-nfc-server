import express from 'express';
import ScanEvent from '../models/ScanEvent.js';
import NfcCard from '../models/NfcCard.js';
import Business from '../models/Business.js';
import { protect, businessOnly } from '../middleware/auth.js';
import { success, failure } from '../utils/response.js';

const router = express.Router();

// GET /api/analytics/overview - Dashboard overview stats
router.get('/overview', protect, businessOnly, async (req, res) => {
  try {
    const business = await Business.findOne({ owner: req.user._id });
    if (!business) return failure(res, 'Business not found', 404);

    const cards = await NfcCard.find({ business: business._id });
    const cardIds = cards.map(c => c._id);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(todayStart.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [totalScans, todayScans, weekScans, monthScans, uniqueVisitors] = await Promise.all([
      ScanEvent.countDocuments({ card: { $in: cardIds } }),
      ScanEvent.countDocuments({ card: { $in: cardIds }, timestamp: { $gte: todayStart } }),
      ScanEvent.countDocuments({ card: { $in: cardIds }, timestamp: { $gte: weekStart } }),
      ScanEvent.countDocuments({ card: { $in: cardIds }, timestamp: { $gte: monthStart } }),
      ScanEvent.distinct('visitorHash', { card: { $in: cardIds }, timestamp: { $gte: monthStart } }),
    ]);

    return success(res, {
      totalScans,
      todayScans,
      weekScans,
      monthScans,
      uniqueVisitors: uniqueVisitors.length,
      totalCards: cards.length,
    });
  } catch (error) {
    return failure(res, 'Server error', 500);
  }
});

// GET /api/analytics/timeline - Scans over time
router.get('/timeline', protect, businessOnly, async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const business = await Business.findOne({ owner: req.user._id });
    if (!business) return failure(res, 'Business not found', 404);

    const cards = await NfcCard.find({ business: business._id });
    const cardIds = cards.map(c => c._id);

    const days = parseInt(period) || 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const timeline = await ScanEvent.aggregate([
      { $match: { card: { $in: cardIds }, timestamp: { $gte: startDate } } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          },
          scans: { $sum: 1 },
          unique: { $addToSet: '$visitorHash' },
        },
      },
      { $sort: { '_id.date': 1 } },
      {
        $project: {
          date: '$_id.date',
          scans: 1,
          uniqueVisitors: { $size: '$unique' },
        },
      },
    ]);

    return success(res, { timeline });
  } catch (error) {
    return failure(res, 'Server error', 500);
  }
});

// GET /api/analytics/devices - Device breakdown
router.get('/devices', protect, businessOnly, async (req, res) => {
  try {
    const business = await Business.findOne({ owner: req.user._id });
    if (!business) return failure(res, 'Business not found', 404);

    const cards = await NfcCard.find({ business: business._id });
    const cardIds = cards.map(c => c._id);

    const deviceStats = await ScanEvent.aggregate([
      { $match: { card: { $in: cardIds } } },
      { $group: { _id: '$device', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const osStats = await ScanEvent.aggregate([
      { $match: { card: { $in: cardIds } } },
      { $group: { _id: '$os', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const browserStats = await ScanEvent.aggregate([
      { $match: { card: { $in: cardIds } } },
      { $group: { _id: '$browser', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    return success(res, { devices: deviceStats, os: osStats, browsers: browserStats });
  } catch (error) {
    return failure(res, 'Server error', 500);
  }
});

// GET /api/analytics/cards - Per-card performance
router.get('/cards', protect, businessOnly, async (req, res) => {
  try {
    const business = await Business.findOne({ owner: req.user._id });
    if (!business) return failure(res, 'Business not found', 404);

    const cards = await NfcCard.find({ business: business._id });

    const cardStats = await Promise.all(
      cards.map(async (card) => {
        const totalScans = await ScanEvent.countDocuments({ card: card._id });
        const uniqueVisitors = await ScanEvent.distinct('visitorHash', { card: card._id });

        return {
          cardId: card.cardId,
          label: card.label,
          totalScans,
          uniqueVisitors: uniqueVisitors.length,
          isActive: card.isActive,
          destinationUrl: card.destinationUrl,
          lastScannedAt: card.stats?.lastScannedAt,
        };
      })
    );

    return success(res, { cards: cardStats });
  } catch (error) {
    return failure(res, 'Server error', 500);
  }
});

// GET /api/analytics/peak-hours - Peak scanning hours
router.get('/peak-hours', protect, businessOnly, async (req, res) => {
  try {
    const business = await Business.findOne({ owner: req.user._id });
    if (!business) return failure(res, 'Business not found', 404);

    const cards = await NfcCard.find({ business: business._id });
    const cardIds = cards.map(c => c._id);

    const peakHours = await ScanEvent.aggregate([
      { $match: { card: { $in: cardIds } } },
      {
        $group: {
          _id: { $hour: '$timestamp' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id': 1 } },
      { $project: { hour: '$_id', count: 1 } },
    ]);

    // Fill missing hours with 0
    const hours = Array.from({ length: 24 }, (_, i) => {
      const found = peakHours.find(h => h.hour === i);
      return { hour: i, count: found?.count || 0 };
    });

    return success(res, { peakHours: hours });
  } catch (error) {
    return failure(res, 'Server error', 500);
  }
});

export default router;