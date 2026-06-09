require('dotenv').config({ path: './.env' });
const mongoose = require('mongoose');
const connectDB = require('./backend/config/database');
const { ensureDemoConnection, getDemoModel } = require('./backend/config/dbConnections');

(async () => {
  try {
    console.log('ENV MONGO_URI set?', !!process.env.MONGO_URI);
    await connectDB();
    console.log('Default mongoose connection name:', mongoose.connection && mongoose.connection.name);
    console.log('Default mongoose host:', mongoose.connection && mongoose.connection.host);
    // require models
    const User = require('./backend/models/User');
    const Login = require('./backend/models/Login');
    const CommunityPost = require('./backend/models/CommunityPost');
    const defaultCounts = {};
    try { defaultCounts.User = await User.countDocuments().catch(()=>'ERR'); } catch(e){ defaultCounts.User = 'ERR'; }
    try { defaultCounts.Login = await Login.countDocuments().catch(()=>'ERR'); } catch(e){ defaultCounts.Login = 'ERR'; }
    try { defaultCounts.CommunityPost = await CommunityPost.countDocuments().catch(()=>'ERR'); } catch(e){ defaultCounts.CommunityPost = 'ERR'; }
    console.log('Default DB counts:', defaultCounts);

    const demoConn = await ensureDemoConnection();
    if (demoConn) {
      console.log('Demo connection db name:', demoConn.db && demoConn.db.databaseName);
      console.log('Demo connection host:', demoConn.host || (demoConn.client && demoConn.client.s && demoConn.client.s.url) || 'unknown');
      const DemoUser = await getDemoModel('User', User).catch(()=>null);
      const DemoLogin = await getDemoModel('Login', Login).catch(()=>null);
      const DemoCommunity = await getDemoModel('CommunityPost', CommunityPost).catch(()=>null);
      const demoCounts = {};
      try { demoCounts.User = DemoUser ? await DemoUser.countDocuments().catch(()=> 'ERR') : null; } catch(e){ demoCounts.User='ERR'; }
      try { demoCounts.Login = DemoLogin ? await DemoLogin.countDocuments().catch(()=> 'ERR') : null; } catch(e){ demoCounts.Login='ERR'; }
      try { demoCounts.CommunityPost = DemoCommunity ? await DemoCommunity.countDocuments().catch(()=> 'ERR') : null; } catch(e){ demoCounts.CommunityPost='ERR'; }
      console.log('Demo DB counts:', demoCounts);
    } else {
      console.log('No demo connection established');
    }
  } catch (err) {
    console.error('Script error:', err && err.stack ? err.stack : err);
  } finally {
    try { await mongoose.connection.close(); } catch(e){}
    process.exit(0);
  }
})();
