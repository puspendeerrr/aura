const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const dns = require('dns');

// Configure custom DNS servers (Cloudflare & Google Public DNS) to ensure SRV record lookups succeed
try {
  dns.setServers(['1.1.1.1', '8.8.8.8', '8.8.4.4']);
} catch (e) {
  console.warn('[DATABASE WARNING] Failed to set custom DNS servers:', e.message);
}

// Force IPv4 first DNS resolution to resolve querySrv ECONNREFUSED issues when connecting to Atlas
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

/**
 * Resolves MongoDB SRV records via DNS-over-HTTPS (DoH)
 * @param {String} host - The Atlas hostname (e.g. cluster0.bt2eug9.mongodb.net)
 * @returns {Promise<Array|null>} Array of resolved SRV record objects
 */
const dnsResolveSrvHttps = async (host) => {
  try {
    console.log(`[DATABASE DoH] Querying DNS-over-HTTPS for _mongodb._tcp.${host}...`);
    const res = await fetch(`https://dns.google/resolve?name=_mongodb._tcp.${host}&type=SRV`);
    const data = await res.json();
    if (data.Answer && data.Answer.length > 0) {
      return data.Answer.map(item => {
        // data field format: "priority weight port target"
        // e.g. "0 0 27017 ac-xcxyody-shard-00-00.bt2eug9.mongodb.net."
        const parts = item.data.split(' ');
        const port = parts[2];
        let target = parts[3];
        if (target.endsWith('.')) {
          target = target.slice(0, -1);
        }
        return { name: target, port: parseInt(port) };
      });
    }
  } catch (err) {
    console.error('[DATABASE DoH] HTTPS DNS lookup failed:', err.message);
  }
  return null;
};

const connectDB = async () => {
  let connUri = process.env.MONGODB_URI;
  
  if (connUri) {
    // Reconstruct connection string if SRV lookup fails locally
    if (connUri.startsWith('mongodb+srv://')) {
      const srvHost = connUri.replace('mongodb+srv://', '').split('/')[0].split('@').pop().split('?')[0];
      
      let srvRecords = null;
      try {
        console.log(`[DATABASE] Performing local DNS SRV lookup for: _mongodb._tcp.${srvHost}`);
        srvRecords = await dns.promises.resolveSrv(`_mongodb._tcp.${srvHost}`);
        console.log('[DATABASE] Local DNS SRV lookup succeeded:', srvRecords);
      } catch (dnsErr) {
        console.warn(`[DATABASE WARNING] Local DNS SRV lookup failed (${dnsErr.message}). Attempting DNS-over-HTTPS...`);
        srvRecords = await dnsResolveSrvHttps(srvHost);
      }

      if (srvRecords && srvRecords.length > 0) {
        const credsAndHost = connUri.replace('mongodb+srv://', '').split('/')[0];
        const hasCreds = credsAndHost.includes('@');
        const credentials = hasCreds ? credsAndHost.split('@')[0] : '';
        
        const nodes = srvRecords.map(r => `${r.name}:${r.port}`).join(',');
        const pathAndParams = connUri.replace('mongodb+srv://', '').split('/')[1] || '';
        
        const separator = pathAndParams.includes('?') ? '&' : '?';
        connUri = `mongodb://${hasCreds ? `${credentials}@` : ''}${nodes}/${pathAndParams}${separator}ssl=true&authSource=admin`;
        
        console.log('[DATABASE] Successfully reconstructed standard connection string via SRV translation.');
      }
    }

    try {
      console.log('[DATABASE] Attempting connection to MongoDB...');
      const conn = await mongoose.connect(connUri, { serverSelectionTimeoutMS: 5000 });
      console.log(`[DATABASE] Connected to MongoDB: ${conn.connection.host}`);
      return conn;
    } catch (err) {
      console.error(`[DATABASE WARNING] Connection to MongoDB failed: ${err.message}`);
    }
  }

  // Fallback to local MongoDB or MongoMemoryServer
  try {
    const localUri = 'mongodb://localhost:27017/aura';
    console.log(`[DATABASE] Attempting connection to local MongoDB at ${localUri}...`);
    const conn = await mongoose.connect(localUri, { serverSelectionTimeoutMS: 2000 });
    console.log(`[DATABASE] Connected to local MongoDB: ${conn.connection.host}`);
    return conn;
  } catch (localErr) {
    console.log('[DATABASE] Local MongoDB connection failed. Starting in-memory MongoDB database...');
    try {
      const mongoServer = await MongoMemoryServer.create();
      connUri = mongoServer.getUri();
      global.__MONGO_MEMORY_SERVER__ = mongoServer;
      
      const conn = await mongoose.connect(connUri);
      console.log(`[DATABASE] Connected to in-memory MongoDB: ${conn.connection.host}`);
      return conn;
    } catch (memErr) {
      console.error(`[DATABASE FATAL] In-memory MongoDB failed to start: ${memErr.message}`);
      process.exit(1);
    }
  }
};

// Execute connection
connectDB();

module.exports = mongoose;
