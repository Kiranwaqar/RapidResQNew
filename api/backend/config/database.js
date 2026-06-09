//MongoDB Atlas Database Configuration
 
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGO_URI;

    // Fail-fast assertions for misconfigured environments
    const allowedHostsEnv = process.env.MONGO_ALLOWED_HOSTS || process.env.MONGO_EXPECTED_HOST || '';
    const allowedHosts = allowedHostsEnv
      ? allowedHostsEnv.split(',').map(s => s.trim()).filter(Boolean)
      : null;

    if (!mongoURI) {
      const msg = 'MONGO_URI is not defined in environment variables. Please add MONGO_URI to your environment (Vercel dashboard or .env)';
      // In development, throw so the error is visible early. In production, log and return to avoid crashing serverless functions.
      if (process.env.NODE_ENV && process.env.NODE_ENV !== 'production') {
        throw new Error(msg);
      } else {
        console.error(msg);
        return;
      }
    }

    // If the caller defined an expected host(s), validate that the provided MONGO_URI references at least one allowed host
    if (allowedHosts && allowedHosts.length > 0) {
      const matches = allowedHosts.some(h => mongoURI.includes(h));
      if (!matches) {
        const msg = `MONGO_URI host mismatch. Expected one of [${allowedHosts.join(', ')}] to appear in MONGO_URI`;
        if (process.env.NODE_ENV && process.env.NODE_ENV !== 'production') {
          throw new Error(msg);
        } else {
          console.error(msg);
        }
      }
    }

    // Reuse existing connection if already connected (important for serverless)
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      console.log('MongoDB already connected');
      return;
    }

    const conn = await mongoose.connect(mongoURI, {
      // Recommended options
      // useNewUrlParser and useUnifiedTopology are default in mongoose 6+
    });

    console.log(`MongoDB Atlas Connected: ${conn.connection.host}`);
    console.log(`Database: ${conn.connection.name}`);

    // Handle connection events
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('MongoDB disconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      console.log('MongoDB connection closed through app termination');
      process.exit(0);
    });

  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    // Do not exit the process in a serverless environment; return so the caller can handle failure
    return;
  }
};

module.exports = connectDB;

