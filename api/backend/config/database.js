//MongoDB Atlas Database Configuration
 
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGO_URI;

    if (!mongoURI) {
      console.error('MONGO_URI is not defined in environment variables');
      console.log('Please add MONGO_URI to your environment (Vercel dashboard or .env)');
      // Return early instead of exiting the process so serverless functions don't crash on startup
      return;
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

