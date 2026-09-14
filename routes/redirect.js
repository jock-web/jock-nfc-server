import express from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import UAParser from 'ua-parser-js';
import NfcCard from '../models/NfcCard.js';
import ScanEvent from '../models/ScanEvent.js';

const router = express.Router();

// ============================================
// IN-MEMORY CACHE for fast redirects
// ============================================
const redirectCache = new Map();
const CACHE_TTL = parseInt(process.env.REDIRECT_CACHE_TTL) || 300; // 5 minutes default

function getCachedRedirect(cardId) {
  const cached = redirectCache.get(cardId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL * 1000) {
    return cached.data;
  }
  return null;
}

function setCachedRedirect(cardId, data) {
  redirectCache.set(cardId, { data, timestamp: Date.now() });
}

function invalidateCache(cardId) {
  redirectCache.delete(cardId);
}

// ============================================
// RATE LIMITER for redirect endpoint
// Prevents abuse/bot spam
// ============================================
const redirectLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 redirects per minute per IP
  message: { error: 'Too many requests' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
});

// ============================================
// GET /s/:cardId
// THE CORE NFC REDIRECT ENDPOINT
// Must be EXTREMELY FAST
// ============================================
router.get('/:cardId', redirectLimiter, async (req, res) => {
  const startTime = Date.now();
  const { cardId } = req.params;

  try {
    // 1. Check cache first (fastest path)
    let card = getCachedRedirect(cardId);

    // 2. If not cached, query database
    if (!card) {
      card = await NfcCard.findOne(
        { cardId, isActive: true },
        { destinationUrl: 1, business: 1, isActive: 1, redirectPage: 1 }
      ).populate('business', 'name isActive isSuspended');

      if (!card) {
        return res.status(404).json({ 
          error: 'Card not found or inactive',
          cardId 
        });
      }

      // Check if business is suspended
      if (card.business?.isSuspended) {
        return res.status(403).json({ error: 'Business suspended' });
      }

      // Cache the result
      setCachedRedirect(cardId, card);
    }

    // 3. Validate destination URL (security)
    const destinationUrl = card.destinationUrl;
    try {
      const url = new URL(destinationUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return res.status(400).json({ error: 'Invalid destination URL' });
      }
    } catch {
      return res.status(400).json({ error: 'Malformed destination URL' });
    }

    // 4. Record scan event (async - don't block redirect)
    recordScanEvent(cardId, card, req).catch(err => {
      console.error('Failed to record scan:', err);
    });

    // 5. REDIRECT (fastest possible)
    const responseTime = Date.now() - startTime;
    
    // Add performance header
    res.setHeader('X-Response-Time', `${responseTime}ms`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    // 302 redirect (temporary - allows URL changes)
    res.redirect(302, destinationUrl);

  } catch (error) {
    console.error('Redirect error:', error);
    res.status(500).json({ error: 'Redirect failed' });
  }
});

// ============================================
// GET /s/:cardId/info
// Get card info without redirecting (for preview)
// ============================================
router.get('/:cardId/info', async (req, res) => {
  try {
    const { cardId } = req.params;
    
    const card = await NfcCard.findOne(
      { cardId, isActive: true },
      { cardId: 1, label: 1, business: 1 }
    ).populate('business', 'name logo category');

    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }

    res.json({
      cardId: card.cardId,
      label: card.label,
      business: card.business,
    });
  } catch (error) {
    console.error('Card info error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ============================================
// RECORD SCAN EVENT (async helper)
// ============================================
async function recordScanEvent(cardId, card, req) {
  try {
    const ua = new UAParser(req.headers['user-agent']);
    const result = ua.getResult();

    // Create visitor hash (privacy-aware - not raw IP)
    const ip = req.ip || req.connection.remoteAddress;
    const visitorHash = crypto
      .createHash('sha256')
      .update(`${ip}-${cardId}-${new Date().toDateString()}`)
      .digest('hex')
      .substring(0, 16);

    // Determine device type
    let device = 'unknown';
    if (result.device?.type === 'mobile') device = 'mobile';
    else if (result.device?.type === 'tablet') device = 'tablet';
    else if (result.os?.name) device = 'mobile'; // Most NFC taps are mobile
    else device = 'desktop';

    // Check if unique visitor (same visitor + card within 24h)
    const recentVisit = await ScanEvent.findOne({
      visitorHash,
      card: card._id,
      timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    // Create scan event
    await ScanEvent.create({
      card: card._id,
      business: card.business._id,
      userAgent: req.headers['user-agent'],
      device,
      os: result.os?.name || 'Unknown',
      browser: result.browser?.name || 'Unknown',
      visitorHash,
      source: req.query.source || 'nfc',
      isUniqueVisitor: !recentVisit,
      referrer: req.headers.referer || req.headers.referrer,
      timestamp: new Date(),
    });

    // Update card stats (atomic increment)
    await NfcCard.findByIdAndUpdate(card._id, {
      $inc: { 
        'stats.totalScans': 1,
        'stats.todayScans': 1,
        'stats.weekScans': 1,
        'stats.monthScans': 1,
      },
      $set: { 'stats.lastScannedAt': new Date() },
    });

  } catch (error) {
    console.error('Record scan error:', error);
    // Don't throw - scan recording failure shouldn't affect redirect
  }
}

// Export cache invalidation for use in other routes
export { invalidateCache };

export default router;
