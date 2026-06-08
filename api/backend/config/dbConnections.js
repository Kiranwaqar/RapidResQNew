const mongoose = require('mongoose');

let demoConn = null;

const ensureDemoConnection = async () => {
  if (demoConn) return demoConn;
  try {
    const mongoURI = process.env.MONGO_URI;
    if (!mongoURI) {
      console.warn('dbConnections: MONGO_URI not set; demo connection will not be created');
      return null;
    }

    // Create a dedicated connection for the demo DB name. This does not affect
    // the default mongoose connection used elsewhere.
    demoConn = await mongoose.createConnection(mongoURI, {
      // Explicitly set the dbName so it uses rapidresq_demo
      dbName: process.env.RAPIDRESQ_DEMO_DB || 'rapidresq_demo',
      // keep default options minimal
    });

    // Wait for connection to be ready
    await new Promise((resolve, reject) => {
      demoConn.once('open', resolve);
      demoConn.once('error', reject);
    });

    console.log('Demo DB connection established to', demoConn.host);
    return demoConn;
  } catch (e) {
    console.error('Failed to create demo DB connection:', e && e.message ? e.message : e);
    demoConn = null;
    return null;
  }
};

/**
 * Get (or create) a model bound to the demo connection. If the demo
 * connection cannot be established, returns null so callers can fall back.
 *
 * @param {string} name - Model name
 * @param {import('mongoose').Model} existingModel - A model from which to reuse the schema
 */
const getDemoModel = async (name, existingModel) => {
  const conn = await ensureDemoConnection();
  if (!conn) return null;
  if (conn.models && conn.models[name]) return conn.models[name];
  // Reuse the schema from the existing model if available
  const schema = existingModel && existingModel.schema ? existingModel.schema : null;
  if (!schema) return null;
  return conn.model(name, schema);
};

module.exports = {
  ensureDemoConnection,
  getDemoModel
};
