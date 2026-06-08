const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');

// Try to load SendGrid if available
let sendgrid = null;
try {
  if (process.env.SENDGRID_API_KEY) {
    sendgrid = require('@sendgrid/mail');
    sendgrid.setApiKey(process.env.SENDGRID_API_KEY);
  }
} catch (e) {
  sendgrid = null;
}

// Nodemailer transporter fallback
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || '',
    pass: process.env.EMAIL_PASSWORD || ''
  }
});

// POST /api/admin/send-test-email
router.post('/send-test-email', async (req, res) => {
  try {
    // Accept authentication via either:
    // 1) x-admin-secret header or secret in body/query (matches ADMIN_SECRET or EMAIL_PASSWORD)
    // 2) HTTP Basic auth using EMAIL_USER and EMAIL_PASSWORD (recommended if you have SMTP creds)

    const provided = req.get('x-admin-secret') || req.body.secret || req.query.secret;
    const adminSecret = process.env.ADMIN_SECRET || process.env.EMAIL_PASSWORD;

    let authorized = false;

    if (adminSecret && provided && provided === adminSecret) {
      authorized = true;
    }

    // If not authorized yet, check Basic auth header
    if (!authorized) {
      const authHeader = req.get('authorization') || '';
      if (authHeader.startsWith('Basic ')) {
        try {
          const base64 = authHeader.split(' ')[1] || '';
          const decoded = Buffer.from(base64, 'base64').toString('utf8');
          const [user, pass] = decoded.split(':');
          if (user && pass && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
            if (user === process.env.EMAIL_USER && pass === process.env.EMAIL_PASSWORD) {
              authorized = true;
            }
          }
        } catch (e) {
          // ignore decode errors
        }
      }
    }

    // If not authorized, support a safe debug mode that returns boolean checks
    if (!authorized) {
      const debugMode = (req.query.debug === 'true' || req.body.debug === true || req.body.debug === 'true');

      if (debugMode) {
        // Build non-sensitive diagnostic info
        const authHeader = req.get('authorization') || '';
        const headerPresent = !!authHeader;
        const providedAdminSecret = !!provided && provided === adminSecret;
        const envEmailUserPresent = !!process.env.EMAIL_USER;
        const envEmailPasswordPresent = !!process.env.EMAIL_PASSWORD;

        // Attempt to decode Basic header to check matches (without exposing values)
        let basicUserMatches = false;
        let basicPassMatches = false;
        let providedUserLength = 0;
        let providedPassLength = 0;
        let envEmailUserLength = process.env.EMAIL_USER ? process.env.EMAIL_USER.length : 0;
        let envEmailPasswordLength = process.env.EMAIL_PASSWORD ? process.env.EMAIL_PASSWORD.length : 0;
        let trimmedUserMatches = false;
        let trimmedPassMatches = false;

        if (authHeader.startsWith('Basic ')) {
          try {
            const base64 = authHeader.split(' ')[1] || '';
            const decoded = Buffer.from(base64, 'base64').toString('utf8');
            const [user, pass] = decoded.split(':');
            if (user) providedUserLength = user.length;
            if (pass) providedPassLength = pass.length;
            if (user && envEmailUserPresent) basicUserMatches = (user === process.env.EMAIL_USER);
            if (pass && envEmailPasswordPresent) basicPassMatches = (pass === process.env.EMAIL_PASSWORD);
            if (user && process.env.EMAIL_USER) trimmedUserMatches = (user.trim() === process.env.EMAIL_USER.trim());
            if (pass && process.env.EMAIL_PASSWORD) trimmedPassMatches = (pass.trim() === process.env.EMAIL_PASSWORD.trim());
          } catch (e) {
            // ignore errors parsing header
          }
        }

        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
          diagnostics: {
            headerPresent,
            providedAdminSecretMatch: providedAdminSecret,
            basicUserMatches,
            basicPassMatches,
            envEmailUserPresent,
            envEmailPasswordPresent,
            providedUserLength,
            providedPassLength,
            envEmailUserLength,
            envEmailPasswordLength,
            trimmedUserMatches,
            trimmedPassMatches
          }
        });
      }

      return res.status(401).json({ success: false, message: 'Unauthorized: provide x-admin-secret or use HTTP Basic auth with EMAIL_USER/EMAIL_PASSWORD.' });
    }

    const to = req.body.to || process.env.EMAIL_USER;
    if (!to) {
      return res.status(400).json({ success: false, message: 'No recipient configured. Set EMAIL_USER or include `to` in body.' });
    }

    const subject = req.body.subject || 'RapidResQ Test Email';
    const html = req.body.html || `<p>This is a test email from RapidResQ sent at ${new Date().toISOString()}</p>`;

    // Send using SendGrid if available
    if (sendgrid) {
      const msg = {
        to,
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@rapidresq.app',
        subject,
        html
      };
      await sendgrid.send(msg);
      return res.json({ success: true, provider: 'sendgrid', to });
    }

    // Nodemailer fallback
    await transporter.sendMail({ from: process.env.EMAIL_USER, to, subject, html });
    return res.json({ success: true, provider: 'nodemailer', to });
  } catch (err) {
    console.error('Test email error:', err && err.message ? err.message : err);
    return res.status(500).json({ success: false, message: 'Failed to send test email', error: String(err && err.message ? err.message : err) });
  }
});

// GET /api/admin/volunteers - list volunteer emails (protected)
router.get('/volunteers', async (req, res) => {
  try {
    // Accept same authentication methods as send-test-email
    const provided = req.get('x-admin-secret') || req.query.secret;
    const adminSecret = process.env.ADMIN_SECRET || process.env.EMAIL_PASSWORD;

    let authorized = false;
    if (adminSecret && provided && provided === adminSecret) authorized = true;

    if (!authorized) {
      const authHeader = req.get('authorization') || '';
      if (authHeader.startsWith('Basic ')) {
        try {
          const base64 = authHeader.split(' ')[1] || '';
          const decoded = Buffer.from(base64, 'base64').toString('utf8');
          const [user, pass] = decoded.split(':');
          if (user && pass && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
            if (user === process.env.EMAIL_USER && pass === process.env.EMAIL_PASSWORD) {
              authorized = true;
            }
          }
        } catch (e) {
          // ignore
        }
      }
    }

    if (!authorized) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const User = require('../models/User');
    const volunteers = await User.find({ isVolunteer: true }).select('email fullName');
    const list = volunteers.map(v => ({ email: v.email, fullName: v.fullName }));
    return res.json({ success: true, count: list.length, volunteers: list });
  } catch (err) {
    console.error('Volunteers list error:', err && err.message ? err.message : err);
    return res.status(500).json({ success: false, message: 'Failed to list volunteers', error: String(err && err.message ? err.message : err) });
  }
});

module.exports = router;
