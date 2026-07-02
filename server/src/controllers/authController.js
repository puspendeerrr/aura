const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const emailService = require('../services/email');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[AUTH FATAL] JWT_SECRET is required in environment variables.');
  process.exit(1);
}

// Helper to generate JWT
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

exports.register = async (req, res) => {
  try {
    const { email, phone, username, password, name } = req.body;

    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Email, username, and password are required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { username: username.toLowerCase() }
      ]
    });

    if (existingUser) {
      if (existingUser.email === email.toLowerCase()) {
        return res.status(400).json({ error: 'Email is already registered' });
      }
      return res.status(400).json({ error: 'Username is already taken' });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const user = await User.create({
      email: email.toLowerCase(),
      phone,
      username: username.toLowerCase(),
      passwordHash,
      name,
      verified: true, // Automatically mark the user as verified
    });

    const token = generateToken(user._id);

    return res.status(201).json({
      message: 'Registration successful!',
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        verified: user.verified,
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Registration failed due to a server error' });
  }
};

exports.login = async (req, res) => {
  try {
    const { loginKey, password } = req.body;

    if (!loginKey || !password) {
      return res.status(400).json({ error: 'Email/Username and password are required' });
    }

    const user = await User.findOne({
      $or: [
        { email: loginKey.toLowerCase() },
        { username: loginKey.toLowerCase() }
      ]
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    if (user.isBanned) {
      return res.status(403).json({
        error: 'Your account has been suspended',
        reason: user.banReason || 'Violation of community guidelines'
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = generateToken(user._id);

    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        name: user.name,
        avatar: user.avatar,
        verified: user.verified,
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed due to a server error' });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      // Return 200 to prevent user enumeration
      return res.json({ message: 'If the email exists, a reset code was sent' });
    }

    const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 30 * 60 * 1000); // 30 mins

    user.resetToken = resetToken;
    user.resetTokenExpiry = expiry;
    await user.save();

    // Send password reset email via service
    await emailService.sendPasswordResetCode(user.email, resetToken);

    return res.json({ message: 'If the email exists, a reset code was sent' });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ error: 'Reset failed' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'Email, code, and new password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user || user.resetToken !== code || new Date() > user.resetTokenExpiry) {
      return res.status(400).json({ error: 'Invalid or expired password reset code' });
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    user.passwordHash = passwordHash;
    user.resetToken = null;
    user.resetTokenExpiry = null;
    await user.save();

    return res.json({ message: 'Password reset successful!' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: 'Password update failed' });
  }
};

exports.getCurrentUser = async (req, res) => {
  try {
    return res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        phone: req.user.phone,
        username: req.user.username,
        name: req.user.name,
        bio: req.user.bio,
        avatar: req.user.avatar,
        isPrivate: req.user.isPrivate,
        verified: req.user.verified,
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Could not fetch user' });
  }
};
