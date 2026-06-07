// frontend/src/utils/config.js

// Use Vercel environment variable if set. If not provided (or during a
// frontend-only deploy), default to the known production API host so
// the frontend can reach the backend.
const API_URL =
	process.env.REACT_APP_API_URL ||
	"https://rapid-res-qn-ew.vercel.app/api"; // production API endpoint

export default API_URL;