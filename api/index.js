// api/index.js
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const connectDB = require("./backend/config/database");

// Import routes
const authRoutes = require("./backend/routes/authRoutes");
const emergencyRoutes = require("./backend/routes/emergencyRoutes");
const chatRoutes = require("./backend/routes/chat");
const communityRoutes = require("./backend/routes/community");
const panicRoutes = require("./backend/routes/panic");

dotenv.config();

const app = express();

// Connect to MongoDB Atlas
connectDB();

// Middleware
app.use(cors()); // You can restrict origins if needed
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Debug: log incoming requests in dev
if (process.env.NODE_ENV !== "production") {
  app.use("/api", (req, res, next) => {
    console.log(`[${req.method}] ${req.path}`);
    next();
  });
}

// API Routes
app.use("/api", authRoutes);
app.use("/api/emergency", emergencyRoutes);
app.use("/api", chatRoutes);
app.use("/api", communityRoutes);
app.use("/api/community", communityRoutes); // backward compatibility
app.use("/api", panicRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error("Server Error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : "Something went wrong",
  });
});

// Export Express app (Vercel's Node runtime will call this as a function)
module.exports = app;