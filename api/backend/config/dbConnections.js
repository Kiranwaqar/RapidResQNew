const mongoose = require('mongoose');

let demoConn = null;

const ensureDemoConnection = async () => {
  if (demoConn) return demoConn;
  try {
    // Only create a dedicated demo connection when an explicit demo URI is provided.
    // This prevents accidental writes to a different DB when no demo environment is configured.
    const demoUri = process.env.MONGO_URI_DEMO;
    if (!demoUri) {
      // No explicit demo URI - do not create a demo connection. Callers should fall back to default models.
      // This ensures all writes go to the primary MONGO_URI by default.
      return null;
    }

    // Determine dbName: explicit demo DB env overrides fallback
    const dbName = process.env.RAPIDRESQ_DEMO_DB || 'rapidresq_demo';

    // Create a dedicated connection for the demo DB name. This does not affect
    // the default mongoose connection used elsewhere.
    demoConn = await mongoose.createConnection(demoUri, {
      dbName,
      // Recommended options (compatible with mongoose 6+)
      // leave other connection options to defaults or to uri query params
    });

    // Wait for connection to be ready
    await new Promise((resolve, reject) => {
      demoConn.once('open', resolve);
      demoConn.once('error', reject);
    });

    console.log('Demo DB connection established to', demoConn.host, 'db=', demoConn.db && demoConn.db.databaseName ? demoConn.db.databaseName : dbName);
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
