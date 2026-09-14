import Joi from 'joi';

// Validation schemas
export const schemas = {
  // Authentication
  login: Joi.object({
    username: Joi.string().min(3).max(50).required().trim(),
    password: Joi.string().min(6).required(),
  }),

  register: Joi.object({
    username: Joi.string().min(3).max(50).required().trim().lowercase(),
    password: Joi.string().min(6).required(),
    email: Joi.string().email().required().trim().lowercase(),
    fullName: Joi.string().min(2).max(100).required().trim(),
    businessName: Joi.string().min(2).max(100).optional().trim(),
    category: Joi.string()
      .valid('restaurant', 'cafe', 'salon', 'hotel', 'shop', 'clinic', 'gym', 'barber', 'other')
      .optional(),
  }),

  // Business
  updateBusiness: Joi.object({
    name: Joi.string().min(2).max(100).trim(),
    description: Joi.string().max(500).trim(),
    phone: Joi.string().trim(),
    website: Joi.string().uri().trim(),
    address: Joi.object({
      street: Joi.string().trim(),
      city: Joi.string().trim(),
      state: Joi.string().trim(),
      zipCode: Joi.string().trim(),
      country: Joi.string().trim(),
    }),
  }),

  // NFC Card
  updateDestination: Joi.object({
    destinationUrl: Joi.string()
      .uri({ scheme: ['http', 'https'] })
      .required()
      .messages({
        'string.uri': 'Must be a valid URL',
        'string.uriScheme': 'Only HTTP and HTTPS URLs are allowed',
      }),
  }),

  updateCard: Joi.object({
    label: Joi.string().max(50).trim(),
    isActive: Joi.boolean(),
  }),

  // Order
  createOrder: Joi.object({
    items: Joi.array()
      .items(
        Joi.object({
          product: Joi.string().required(),
          quantity: Joi.number().integer().min(1).required(),
          customization: Joi.object({
            businessName: Joi.string().max(100).trim(),
            logo: Joi.string().max(500),
            color: Joi.string().max(20),
            cardLabel: Joi.string().max(50).trim(),
          }),
        })
      )
      .min(1)
      .required(),
    shippingAddress: Joi.object({
      fullName: Joi.string().required().trim(),
      street: Joi.string().required().trim(),
      city: Joi.string().required().trim(),
      state: Joi.string().required().trim(),
      zipCode: Joi.string().required().trim(),
      country: Joi.string().default('US').trim(),
      phone: Joi.string().trim(),
    }).required(),
    discountCode: Joi.string().trim(),
  }),

  // Admin
  createBusiness: Joi.object({
    username: Joi.string().min(3).max(50).required().trim().lowercase(),
    password: Joi.string().min(6).required(),
    email: Joi.string().email().required().trim().lowercase(),
    fullName: Joi.string().min(2).max(100).required().trim(),
    businessName: Joi.string().min(2).max(100).required().trim(),
    category: Joi.string()
      .valid('restaurant', 'cafe', 'salon', 'hotel', 'shop', 'clinic', 'gym', 'barber', 'other')
      .required(),
  }),

  updateBusinessAdmin: Joi.object({
    isActive: Joi.boolean(),
    isSuspended: Joi.boolean(),
    suspendedReason: Joi.string().max(500),
    plan: Joi.string().valid('free', 'starter', 'professional', 'enterprise'),
  }),

  createCard: Joi.object({
    cardId: Joi.string().min(1).max(100).required().trim(),
    businessId: Joi.string().required(),
    destinationUrl: Joi.string().uri({ scheme: ['http', 'https'] }).required(),
    label: Joi.string().max(50).trim().allow(''),
  }),

  updateAdminCard: Joi.object({
    isActive: Joi.boolean(),
    destinationUrl: Joi.string().uri({ scheme: ['http', 'https'] }),
    label: Joi.string().max(50).trim().allow(''),
  }).min(1),

  updateCardDesign: Joi.object({
    title: Joi.string().max(24).required().trim(),
    subtitle: Joi.string().max(30).required().trim(),
    colors: Joi.object({
      c1: Joi.string().pattern(/^#[0-9a-f]{6}$/i).required(),
      c2: Joi.string().pattern(/^#[0-9a-f]{6}$/i).required(),
      c3: Joi.string().pattern(/^#[0-9a-f]{6}$/i).required(),
      c4: Joi.string().pattern(/^#[0-9a-f]{6}$/i).required(),
    }).required(),
  }),

  updateOrderStatus: Joi.object({
    status: Joi.string().valid('pending', 'processing', 'shipped', 'delivered', 'cancelled').required(),
    trackingNumber: Joi.string().max(200).allow(''),
    trackingUrl: Joi.string().uri({ scheme: ['http', 'https'] }).allow(''),
    adminNotes: Joi.string().max(1000).allow(''),
  }),

  // Password reset
  forgotPassword: Joi.object({
    username: Joi.string().required().trim(),
  }),

  resetPassword: Joi.object({
    token: Joi.string().required(),
    newPassword: Joi.string().min(6).required(),
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(6).required(),
  }),

  payment: Joi.object({
    method: Joi.string().valid('stripe', 'paypal', 'cod', 'bank_transfer').required(),
    transactionId: Joi.string().max(200).trim(),
  }),

  updateUser: Joi.object({
    isActive: Joi.boolean(),
    role: Joi.string().valid('admin', 'business'),
  }).min(1),
};

// Validation middleware factory
export const validate = (schemaName) => {
  return (req, res, next) => {
    const schema = schemas[schemaName];

    if (!schema) {
      return res.status(500).json({
        success: false,
        message: `Validation schema '${schemaName}' not found`,
      });
    }

    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const details = error.details.reduce((acc, err) => {
        const key = err.path.join('.');
        acc[key] = err.message;
        return acc;
      }, {});

      return res.status(400).json({
        success: false,
        message: 'Validation Error',
        details,
      });
    }

    req.body = value;
    next();
  };
};

// URL validation helper
export const isValidDestinationUrl = (url) => {
  try {
    const parsedUrl = new URL(url);

    // Only allow HTTP and HTTPS
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return false;
    }

    // Block IP addresses
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(parsedUrl.hostname)) {
      return false;
    }

    // Block localhost in production
    if (process.env.NODE_ENV === 'production') {
      if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1') {
        return false;
      }
    }

    // Block known URL shorteners (can be used for phishing)
    const blockedDomains = ['bit.ly', 'tinyurl.com', 'goo.gl', 'is.gd'];
    if (blockedDomains.some((domain) => parsedUrl.hostname.includes(domain))) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
};
