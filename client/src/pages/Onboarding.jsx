import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, User, Phone, Eye, EyeOff } from 'lucide-react';

export default function Onboarding() {
  const { login, apiCall } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [isForgot, setIsForgot] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Form Fields
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [loginKey, setLoginKey] = useState(''); // can be email or username
  
  // Forgot / Reset fields
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetStep, setResetStep] = useState(1);

  // Status handlers
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const resetFormStates = () => {
    setError('');
    setSuccess('');
    setEmail('');
    setPhone('');
    setUsername('');
    setName('');
    setPassword('');
    setLoginKey('');
    setResetCode('');
    setNewPassword('');
    setResetStep(1);
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await apiCall('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ loginKey, password }),
      });
      login(data.token, data.user);
    } catch (err) {
      setError(err.message || 'Login failed. Verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await apiCall('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email,
          phone: phone || null,
          username,
          name,
          password,
        }),
      });
      setSuccess('Account created! Verification code sent to email/terminal logs.');
      login(data.token, data.user);
    } catch (err) {
      setError(err.message || 'Signup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await apiCall('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSuccess('Reset code sent! Check your inbox or server logs.');
      setResetStep(2);
    } catch (err) {
      setError(err.message || 'Error executing password reset request.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await apiCall('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          email,
          code: resetCode,
          newPassword,
        }),
      });
      setSuccess('Password reset successful! You can sign in now.');
      setIsForgot(false);
      setIsLogin(true);
      resetFormStates();
    } catch (err) {
      setError(err.message || 'Failed to reset password. Check code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex justify-center items-center min-h-screen w-screen bg-[#0b0c10] gap-12 p-8 flex-wrap relative overflow-hidden">
      
      {/* Background Decorative Neon Glows */}
      <div className="absolute top-[-80px] left-[-80px] w-96 h-96 rounded-full bg-purple-600/20 blur-[100px] pointer-events-none"></div>
      <div className="absolute bottom-[-80px] right-[-80px] w-96 h-96 rounded-full bg-cyan-400/15 blur-[100px] pointer-events-none"></div>

      {/* Brand Visual Column */}
      <div className="flex-1 max-w-md z-10 select-none">
        <h1 className="text-7xl font-extrabold tracking-wider mb-4 bg-gradient-to-r from-purple-500 to-cyan-400 bg-clip-text text-transparent">
          Aura
        </h1>
        <p className="text-[#c5c6c7] text-lg leading-relaxed font-light">
          Share your energy, connect visually. Built with premium glassmorphism, real-time messaging, and interactive content.
        </p>
      </div>

      {/* Auth Form Box */}
      <div className="w-full max-w-md bg-[#1f2833]/40 backdrop-blur-md p-10 border border-purple-500/20 shadow-2xl rounded-2xl z-10 transition-all duration-300 hover:shadow-purple-500/10">
        
        {error && (
          <div className="text-red-400 bg-red-950/30 border border-red-500/20 p-3 rounded-xl text-sm mb-5 text-center">
            {error}
          </div>
        )}
        {success && (
          <div className="text-green-400 bg-green-950/30 border border-green-500/20 p-3 rounded-xl text-sm mb-5 text-center">
            {success}
          </div>
        )}

        {isForgot ? (
          /* FORGOT FLOW */
          <div>
            <h2 className="text-2xl font-bold mb-6 text-center text-white">Reset Password</h2>
            {resetStep === 1 ? (
              <form onSubmit={handleForgotSubmit} className="space-y-4">
                <div className="relative flex items-center">
                  <Mail size={18} className="absolute left-4 text-gray-400" />
                  <input 
                    type="email" 
                    placeholder="Enter Registered Email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full py-3 pl-12 pr-4 bg-black/30 border border-purple-500/15 rounded-xl text-white outline-none focus:border-cyan-400 transition"
                    required
                  />
                </div>
                <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white font-semibold shadow-md transition transform active:scale-95 disabled:opacity-50">
                  {loading ? 'Sending...' : 'Send Reset Code'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleResetSubmit} className="space-y-4">
                <div className="relative flex items-center">
                  <Mail size={18} className="absolute left-4 text-gray-400" />
                  <input 
                    type="text" 
                    placeholder="6-Digit Reset Code" 
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    className="w-full py-3 pl-12 pr-4 bg-black/30 border border-purple-500/15 rounded-xl text-white outline-none focus:border-cyan-400 transition text-center tracking-widest text-lg font-bold"
                    maxLength={6}
                    required
                  />
                </div>
                <div className="relative flex items-center">
                  <Lock size={18} className="absolute left-4 text-gray-400" />
                  <input 
                    type="password" 
                    placeholder="New Secure Password" 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full py-3 pl-12 pr-4 bg-black/30 border border-purple-500/15 rounded-xl text-white outline-none focus:border-cyan-400 transition"
                    required
                  />
                </div>
                <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white font-semibold shadow-md transition transform active:scale-95 disabled:opacity-50">
                  {loading ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            )}

            <button 
              onClick={() => { setIsForgot(false); setIsLogin(true); resetFormStates(); }}
              className="mt-6 block mx-auto text-gray-400 hover:text-white text-sm transition"
            >
              Back to Sign In
            </button>
          </div>
        ) : isLogin ? (
          /* LOGIN FLOW */
          <div>
            <h2 className="text-2xl font-bold mb-6 text-center text-white">Sign In</h2>
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div className="relative flex items-center">
                <User size={18} className="absolute left-4 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Username or Email" 
                  value={loginKey}
                  onChange={(e) => setLoginKey(e.target.value)}
                  className="w-full py-3 pl-12 pr-4 bg-black/30 border border-purple-500/15 rounded-xl text-white outline-none focus:border-cyan-400 transition"
                  required
                />
              </div>

              <div className="relative flex items-center">
                <Lock size={18} className="absolute left-4 text-gray-400" />
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  placeholder="Password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full py-3 pl-12 pr-10 bg-black/30 border border-purple-500/15 rounded-xl text-white outline-none focus:border-cyan-400 transition"
                  required
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 text-gray-400 hover:text-white"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <div className="text-right">
                <button 
                  type="button" 
                  onClick={() => { setIsForgot(true); setError(''); }}
                  className="text-sm text-gray-400 hover:text-white transition"
                >
                  Forgot Password?
                </button>
              </div>

              <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white font-semibold shadow-md transition transform active:scale-95 disabled:opacity-50">
                {loading ? 'Signing In...' : 'Sign In'}
              </button>
            </form>

            <div className="mt-6 text-center text-gray-400 text-sm">
              Don't have an account?{' '}
              <button 
                onClick={() => { setIsLogin(false); resetFormStates(); }} 
                className="text-cyan-400 hover:underline font-semibold ml-1"
              >
                Sign Up
              </button>
            </div>
          </div>
        ) : (
          /* SIGNUP FLOW */
          <div>
            <h2 className="text-2xl font-bold mb-6 text-center text-white">Create Account</h2>
            <form onSubmit={handleSignupSubmit} className="space-y-4">
              <div className="relative flex items-center">
                <Mail size={18} className="absolute left-4 text-gray-400" />
                <input 
                  type="email" 
                  placeholder="Email Address" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full py-3 pl-12 pr-4 bg-black/30 border border-purple-500/15 rounded-xl text-white outline-none focus:border-cyan-400 transition"
                  required
                />
              </div>

              <div className="relative flex items-center">
                <User size={18} className="absolute left-4 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Username" 
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full py-3 pl-12 pr-4 bg-black/30 border border-purple-500/15 rounded-xl text-white outline-none focus:border-cyan-400 transition"
                  required
                />
              </div>

              <div className="relative flex items-center">
                <User size={18} className="absolute left-4 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Full Name" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full py-3 pl-12 pr-4 bg-black/30 border border-purple-500/15 rounded-xl text-white outline-none focus:border-cyan-400 transition"
                  required
                />
              </div>

              <div className="relative flex items-center">
                <Phone size={18} className="absolute left-4 text-gray-400" />
                <input 
                  type="tel" 
                  placeholder="Phone Number (Optional)" 
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full py-3 pl-12 pr-4 bg-black/30 border border-purple-500/15 rounded-xl text-white outline-none focus:border-cyan-400 transition"
                />
              </div>

              <div className="relative flex items-center">
                <Lock size={18} className="absolute left-4 text-gray-400" />
                <input 
                  type="password" 
                  placeholder="Password" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full py-3 pl-12 pr-4 bg-black/30 border border-purple-500/15 rounded-xl text-white outline-none focus:border-cyan-400 transition"
                  required
                />
              </div>

              <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 hover:from-purple-500 hover:to-cyan-400 text-white font-semibold shadow-md transition transform active:scale-95 disabled:opacity-50">
                {loading ? 'Creating...' : 'Sign Up'}
              </button>
            </form>

            <div className="mt-6 text-center text-gray-400 text-sm">
              Already have an account?{' '}
              <button 
                onClick={() => { setIsLogin(true); resetFormStates(); }} 
                className="text-cyan-400 hover:underline font-semibold ml-1"
              >
                Sign In
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
