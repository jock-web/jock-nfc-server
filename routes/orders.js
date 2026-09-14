import express from 'express';
import { Order, Product } from '../models/Order.js';
import Business from '../models/Business.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { success, failure } from '../utils/response.js';

const router = express.Router();

// GET /api/products - List available products
router.get('/products', async (req, res) => {
  try {
    const products = await Product.find({ isActive: true });
    return success(res, { products });
  } catch (error) {
    return failure(res, 'Server error', 500);
  }
});

// POST /api/orders - Create new order
router.post('/', protect, validate('createOrder'), async (req, res) => {
  try {
    const { items, shippingAddress, discountCode } = req.body;

    if (!items || !items.length) {
      return failure(res, 'Order must contain at least one item', 400);
    }

    // Calculate totals
    let subtotal = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product) {
        return failure(res, `Product not found: ${item.product}`, 400);
      }
      const itemTotal = product.price * item.quantity;
      subtotal += itemTotal;
      orderItems.push({
        product: product._id,
        quantity: item.quantity,
        price: product.price,
        customization: item.customization,
      });
    }

    // Generate order number
    const orderNumber = `TR-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const business = req.user.role === 'business'
      ? await Business.findOne({ owner: req.user._id })
      : null;

    if (req.user.role === 'business' && !business) {
      return failure(res, 'Business profile not found', 400);
    }

    const order = await Order.create({
      orderNumber,
      customer: req.user._id,
      business: business?._id,
      items: orderItems,
      subtotal,
      discount: 0,
      discountCode,
      shippingCost: subtotal > 50 ? 0 : 5.99, // Free shipping over $50
      total: subtotal + (subtotal > 50 ? 0 : 5.99),
      shippingAddress,
      status: 'pending',
    });

    return success(res, { order, message: 'Order created successfully' }, 201);
  } catch (error) {
    console.error('Create order error:', error);
    return failure(res, 'Server error', 500);
  }
});

// GET /api/orders/my - Get my orders
router.get('/my', protect, async (req, res) => {
  try {
    const business = req.user.role === 'business'
      ? await Business.findOne({ owner: req.user._id }).select('_id')
      : null;
    const query = business
      ? { $or: [{ customer: req.user._id }, { business: business._id }] }
      : { customer: req.user._id };
    const orders = await Order.find(query)
      .populate('items.product', 'name slug')
      .sort({ createdAt: -1 });
    return success(res, { orders });
  } catch (error) {
    return failure(res, 'Server error', 500);
  }
});

// GET /api/orders/:id - Get single order
router.get('/:id', protect, async (req, res) => {
  try {
    const order = await Order.findOne({
      _id: req.params.id,
      ...(req.user.role === 'admin'
        ? {}
        : req.user.role === 'business'
          ? { business: (await Business.findOne({ owner: req.user._id }).select('_id'))?._id }
          : { customer: req.user._id }),
    }).populate('items.product');

    if (!order) return failure(res, 'Order not found', 404);
    return success(res, { order });
  } catch (error) {
    return failure(res, 'Server error', 500);
  }
});

// POST /api/orders/:id/payment - Simulate payment
router.post('/:id/payment', protect, validate('payment'), async (req, res) => {
  try {
    const { method, transactionId } = req.body;

    const order = await Order.findOne({ _id: req.params.id, customer: req.user._id });
    if (!order) return failure(res, 'Order not found', 404);

    order.payment = {
      method,
      transactionId: transactionId || `TXN-${Date.now()}`,
      paidAt: new Date(),
      status: 'completed',
    };
    order.status = 'paid';
    await order.save();

    return success(res, { order, message: 'Payment processed' });
  } catch (error) {
    return failure(res, 'Server error', 500);
  }
});

export default router;