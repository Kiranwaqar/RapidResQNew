// api/index.js - lazy initialize Express app to avoid require-time crashes in serverless
let app = null;
let initError = null;

const initApp = async () => {
  if (app || initError) return;

  try {
    const express = require("express");
    const cors = require("cors");
    const dotenv = require("dotenv");
    dotenv.config();

    const connectDB = require("./backend/config/database");

    // Import routes after dotenv so they can rely on env vars
    const authRoutes = require("./backend/routes/authRoutes");
    const emergencyRoutes = require("./backend/routes/emergencyRoutes");
    const chatRoutes = require("./backend/routes/chat");
    const communityRoutes = require("./backend/routes/community");
    const panicRoutes = require("./backend/routes/panic");
    const adminRoutes = require("./backend/routes/admin");

    const created = express();

    // Middleware
    created.use(cors());
    created.use(express.json());
    created.use(express.urlencoded({ extended: true }));

    // Debug: log incoming requests in dev
    if (process.env.NODE_ENV !== "production") {
      created.use("/api", (req, res, next) => {
        console.log(`[${req.method}] ${req.path}`);
        next();
      });
    }

    // Determine base path: when running as a Vercel/Now serverless function
    // the function is already mounted under `/api`, so avoid double-prefixing.
    const isServerless = !!(process.env.VERCEL || process.env.NOW_REGION || process.env.AWS_LAMBDA_FUNCTION_NAME);
    const basePath = isServerless ? '' : '/api';

    // Helper to join base path with route suffix without creating double slashes
    const withBase = (suffix) => (basePath ? `${basePath}${suffix}` : suffix || '/');

    // API Routes
    // Health check
    created.get(withBase(''), (req, res) => {
      res.json({ success: true, message: 'API is running' });
    });

    // Mount routers at the appropriate base path
    created.use(withBase(''), authRoutes);
    created.use(withBase('/emergency'), emergencyRoutes);
    created.use(withBase(''), chatRoutes);
    created.use(withBase(''), communityRoutes);
    created.use(withBase('/community'), communityRoutes); // backward compatibility
    created.use(withBase(''), panicRoutes);
    created.use(withBase('/admin'), adminRoutes);

    // 404 Handler — provide clearer diagnostics for missing routes
    created.use((req, res) => {
      const method = req.method;
      const url = req.originalUrl || req.url;
      console.warn(`404 ${method} ${url}`);
      res.status(404).json({
        success: false,
        message: `Route not found: ${method} ${url}`,
      });
    });

    // Error Handler
    created.use((err, req, res, next) => {
      console.error("Server Error:", err);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: process.env.NODE_ENV === "development" ? err.message : "Something went wrong",
      });
    });

    // Connect to MongoDB Atlas (don't let connect failure throw unhandled)
    try {
      await connectDB();
    } catch (e) {
      console.error('connectDB() threw during init:', e && e.message ? e.message : e);
    }

    app = created;
  } catch (err) {
    initError = err;
    console.error('App initialization failed:', err && err.stack ? err.stack : err);
  }
};

const runDiagnostics = async () => {
  const result = {
    env: {
      MONGO_URI: !!process.env.MONGO_URI,
      EMAIL_USER: !!process.env.EMAIL_USER,
      EMAIL_PASSWORD: !!process.env.EMAIL_PASSWORD,
      GROQ_API_KEY: !!process.env.GROQ_API_KEY,
      GROQ_MODEL: !!process.env.GROQ_MODEL
    },
    	// include admin and sendgrid visibility flags (do not expose values)
    	envExtras: {
    	  ADMIN_SECRET: !!process.env.ADMIN_SECRET,
    	  SENDGRID_API_KEY: !!process.env.SENDGRID_API_KEY,
    	  EMAIL_FROM: !!process.env.EMAIL_FROM
    	},
    modules: {}
  };

  // Try requiring common modules
  try {
    result.modules.bcrypt = !!require.resolve('bcryptjs');
  } catch (e) {
    result.modules.bcrypt = false;
  }

  try {
    result.modules.nodemailer = !!require.resolve('nodemailer');
  } catch (e) {
    result.modules.nodemailer = false;
  }

  // Try CommonJS require first (some installs provide CJS entrypoints)
  try {
    require('groq-sdk');
    result.modules.groq = true;
  } catch (requireErr) {
    // If require fails, attempt dynamic ESM imports using several candidate paths
    try {
      let mod = null;
      const candidates = ['groq-sdk/index.mjs', 'groq-sdk', 'groq', '@groq/sdk', 'groq-sdk/dist/index.mjs', './node_modules/groq-sdk/index.mjs'];
      for (const candidate of candidates) {
        try {
          mod = await import(candidate);
          break;
        } catch (err) {
          // continue trying
        }
      }
      if (mod) {
        result.modules.groq = true;
      } else {
        result.modules.groq = 'groq-sdk not found via candidates';
      }
    } catch (e) {
      result.modules.groq = String(e && e.message ? e.message : e);
    }
  }

  return result;
};

module.exports = async (req, res) => {
  // Debug endpoint: quick diagnostics without initializing full app
  if (req.url && req.url.startsWith('/api/_debug')) {
    try {
      const diag = await runDiagnostics();
      return res.json({ success: true, diagnostics: diag });
    } catch (e) {
      return res.status(500).json({ success: false, error: String(e && e.message ? e.message : e) });
    }
  }

  // Public lightweight volunteer count for diagnostics (no PII)
  if (req.url && req.url.startsWith('/api/_public/volunteer-count')) {
    try {
      // Lazy init DB connection only
      const connectDB = require('./backend/config/database');
      await connectDB();
      const mongoose = require('mongoose');
      const User = require('./backend/models/User');
      const count = await User.countDocuments({ isVolunteer: true });
      return res.json({ success: true, volunteerCount: count });
    } catch (err) {
      console.error('Volunteer count error:', err && err.stack ? err.stack : err);
      // Temporary: include stack for debugging in response
      return res.status(500).json({ success: false, message: 'Failed to get volunteer count', error: String(err && err.stack ? err.stack : err) });
    }
  }
  await initApp();
  if (initError) {
    console.error('Handling request but app failed to initialize:', initError && initError.stack ? initError.stack : initError);
    res.status(500).json({ success: false, message: 'Server initialization error' });
    return;
  }

  return app(req, res);
};