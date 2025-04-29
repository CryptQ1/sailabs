import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./data.db', (err) => {
  if (err) console.error('Database connection error:', err);
  else console.log('Connected to SQLite database');
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      publicKey TEXT PRIMARY KEY,
      totalPoints INTEGER DEFAULT 0,
      todayPoints INTEGER DEFAULT 0,
      hoursToday REAL DEFAULT 0,
      daysSeason1 INTEGER DEFAULT 0,
      referralsCount INTEGER DEFAULT 0,
      currentTier TEXT DEFAULT 'None',
      referralCode TEXT,
      referralLink TEXT,
      lastConnected INTEGER,
      isNodeConnected INTEGER DEFAULT 0
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      publicKey TEXT,
      description TEXT,
      points INTEGER,
      link TEXT,
      status TEXT DEFAULT 'Pending',
      FOREIGN KEY (publicKey) REFERENCES users (publicKey)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS signatures (
      publicKey TEXT,
      signature TEXT,
      timestamp INTEGER,
      FOREIGN KEY (publicKey) REFERENCES users (publicKey)
    )
  `);
});

export async function insertSignature(publicKey, signature, timestamp) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO signatures (publicKey, signature, timestamp) VALUES (?, ?, ?)`,
      [publicKey, signature, timestamp],
      (err) => (err ? reject(err) : resolve())
    );
  });
}

export async function insertOrUpdateUser(publicKey, referralCode, referralLink, timestamp) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR IGNORE INTO users (publicKey, referralCode, referralLink, lastConnected, isNodeConnected)
       VALUES (?, ?, ?, ?, ?)`,
      [publicKey, referralCode, referralLink, timestamp, 0],
      (err) => (err ? reject(err) : resolve())
    );
  });
}

// Thêm các hàm khác (getUser, updateUser, getTasks, v.v.) từ server.js