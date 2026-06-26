/**
 * Sends a password reset token email to a user
 * @param {String} email - Recipient email
 * @param {String} code - 6-Digit code
 * @returns {Promise<Boolean>} Success status
 */
const sendPasswordResetCode = async (email, code) => {
  const subject = 'Reset Your Aura Password';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 12px; background-color: #fafafa;">
      <h2 style="color: #8a2be2; text-align: center;">Aura Password Reset</h2>
      <p style="font-size: 16px; color: #333333; text-align: center;">We received a request to reset your password. Use the 6-digit code below to set a new password.</p>
      <div style="background-color: #f0e6ff; border: 1px dashed #8a2be2; border-radius: 8px; padding: 15px; margin: 20px 0; text-align: center;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #8a2be2;">${code}</span>
      </div>
      <p style="font-size: 12px; color: #777777; text-align: center;">This code is valid for 30 minutes. If you did not make this request, please ignore this email.</p>
    </div>
  `;

  if (!process.env.RESEND_API_KEY) {
    console.log(`\n==========================================\n[AURA PASSWORD RESET MOCK]\nTo: ${email}\nSubject: ${subject}\nReset Code: ${code}\n==========================================\n`);
    return true;
  }

  try {
    const fromAddress = process.env.EMAIL_FROM || process.env.RESEND_FROM || 'onboarding@resend.dev';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: email,
        subject,
        html,
      }),
    });

    const data = await response.json();
    if (response.ok) {
      return true;
    } else {
      console.error('[RESEND] Reset email send error response:', data);
      return false;
    }
  } catch (error) {
    console.error('[RESEND] Reset email send error:', error);
    return false;
  }
};

module.exports = {
  sendPasswordResetCode,
};


