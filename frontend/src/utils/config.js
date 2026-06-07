// frontend/src/utils/config.js

// Use Vercel environment variable if set, otherwise fallback to the public backend in production
const API_URL = process.env.REACT_APP_API_URL || "https://api-iota-livid-74.vercel.app/api";

export default API_URL;