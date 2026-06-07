// frontend/src/utils/config.js

// Use Vercel environment variable if set. Default to relative '/api' so
// frontend and backend on the same domain talk to each other when deployed.
const API_URL = process.env.REACT_APP_API_URL || "/api";

export default API_URL;