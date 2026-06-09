require('dotenv').config({ path: './.env' });
const mongoose = require('mongoose');
const connectDB = require('./backend/config/database');
const { ensureDemoConnection, getDemoModel } = require('./backend/config/dbConnections');

(async () => {
  try {
    await connectDB();
    const CommunityPost = require('./backend/models/CommunityPost');

    const unique = `test-${Date.now()}-${Math.floor(Math.random()*1000)}`;
    console.log('Unique key:', unique);

    // Insert via default model
    const defaultPost = new CommunityPost({
      type: 'Medical Emergency',
      title: `DEFAULT ${unique}`,
      description: 'Test post for default connection',
      location: 'Testville',
      phone: '1234567890',
      author: 'Tester',
      createdBy: 'tester',
      urgent: false
    });

    await defaultPost.save();
    console.log('Saved defaultPost id:', defaultPost._id);

    // Insert via demo model (if available)
    const demoConn = await ensureDemoConnection().catch(() => null);
    if (demoConn) {
      const DemoCommunity = await getDemoModel('CommunityPost', CommunityPost).catch(() => null);
      if (DemoCommunity) {
        const demoPost = new DemoCommunity({
          type: 'Medical Emergency',
          title: `DEMO ${unique}`,
          description: 'Test post for demo connection',
          location: 'Demoville',
          phone: '0987654321',
          author: 'DemoTester',
          createdBy: 'demotester',
          urgent: false
        });
        await demoPost.save();
        console.log('Saved demoPost id:', demoPost._id);
      } else {
        console.log('Demo model not available');
      }
    } else {
      console.log('Demo connection not established');
    }

    // Now search for the test documents in default and demo
    const foundDefault = await CommunityPost.find({ title: { $regex: unique } }).lean();
    console.log('Found in default connection:', foundDefault.map(d=>({id:d._id,title:d.title})));

    if (demoConn) {
      const DemoCommunity = await getDemoModel('CommunityPost', CommunityPost).catch(() => null);
      const foundDemo = DemoCommunity ? await DemoCommunity.find({ title: { $regex: unique } }).lean() : [];
      console.log('Found in demo connection:', foundDemo.map(d=>({id:d._id,title:d.title})));
    }

  } catch (e) {
    console.error('Error:', e && e.stack ? e.stack : e);
  } finally {
    try { await mongoose.connection.close(); } catch(e){}
    // Close demo connection if open
    try { const dc = require('./backend/config/dbConnections'); if (dc && dc.ensureDemoConnection) { const c = await dc.ensureDemoConnection().catch(()=>null); if (c && c.close) await c.close(); } } catch(e){}
    process.exit(0);
  }
})();
