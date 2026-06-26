const rateLimit = require('express-rate-limit');

// Rate limiter for authentication routes (login, register, reset password)
// Max 15 requests per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  message: {
    error: 'Too many authentication attempts. Please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API rate limiter
// Max 100 requests per 1 minute per IP
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 150,
  message: {
    error: 'Too many requests. Please slow down.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  authLimiter,
  apiLimiter,
};
