const jwt = require('jsonwebtoken');
const prisma = require('../config/db');

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'aura_super_secret_jwt_key_2026');
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found or session expired' });
    }

    if (user.isBanned) {
      return res.status(403).json({ 
        error: 'Your account has been suspended', 
        reason: user.banReason || 'Violation of community guidelines' 
      });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(403).json({ error: 'Invalid or expired access token' });
  }
};

const isAdmin = (req, res, next) => {
  // For standard admin logic: verify if the user is the pre-configured admin or has an admin flag.
  // In our schema, we can designate any username 'admin' or define specific usernames as admins.
  if (req.user && req.user.username.toLowerCase() === 'admin') {
    next();
  } else {
    return res.status(403).json({ error: 'Admin access required' });
  }
};

module.exports = {
  authenticateToken,
  isAdmin,
};
