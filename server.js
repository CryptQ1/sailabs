// server.js

require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');
const path = require('path');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
});

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';
const REFERRAL_POINTS_PER_USER = 50;

const allowedOrigins = [
  'https://sailabs.xyz',
  'https://www.sailabs.xyz',
  'http://localhost:3000', // Giữ lại để phát triển cục bộ
  'http://localhost:3001',
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}));

io.on('connection', (socket) => {
  // Cấu hình CORS cho Socket.IO
  socket.on('connect', () => {
    console.log('Client connected:', socket.id);
  });
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

const db = new sqlite3.Database('./data.db', (err) => {
  if (err) console.error('Database connection error:', err);
  else console.log('Connected to SQLite database');
});

db.serialize(() => {
  db.run(
    `CREATE TABLE IF NOT EXISTS users (
      publicKey TEXT PRIMARY KEY,
      totalPoints INTEGER DEFAULT 0,
      todayPoints INTEGER DEFAULT 0,
      hoursToday REAL DEFAULT 0,
      daysSeason1 INTEGER DEFAULT 0,
      referralsCount INTEGER DEFAULT 0,
      currentTier TEXT DEFAULT 'None',
      referralCode TEXT UNIQUE,
      referralLink TEXT,
      lastConnected INTEGER,
      isNodeConnected INTEGER DEFAULT 0,
      usedReferralCode TEXT,
      discordId TEXT
      discordUsername TEXT, 
      discordAvatar TEXT   
    )`,
    (err) => {
      if (err) console.error('Error creating users table:', err);
      else console.log('Users table created or already exists');
    }
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS signatures (
      publicKey TEXT,
      signature TEXT,
      timestamp INTEGER
    )`,
    (err) => {
      if (err) console.error('Error creating signatures table:', err);
      else console.log('Signatures table created or already exists');
    }
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS daily_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT NOT NULL,
      date TEXT NOT NULL,
      points INTEGER NOT NULL,
      UNIQUE(wallet, date)
    )`,
    (err) => {
      if (err) console.error('Error creating daily_points table:', err);
      else console.log('Daily_points table created or already exists');
    }
  );

  const addColumnIfNotExists = (columnName, columnDefinition) => {
    db.all(`PRAGMA table_info(users)`, (err, columns) => {
      if (err) {
        console.error(`Error checking users table schema for ${columnName}:`, err);
        return;
      }
      const columnNames = columns.map((col) => col.name);
      if (!columnNames.includes(columnName)) {
        db.run(`ALTER TABLE users ADD COLUMN ${columnDefinition}`, (err) => {
          if (err) console.error(`Error adding ${columnName} column:`, err);
          else console.log(`Added ${columnName} column`);
        });
      } else {
        console.log(`${columnName} column already exists`);
      }
    });
  };

  addColumnIfNotExists('lastConnected', 'lastConnected INTEGER');
  addColumnIfNotExists('isNodeConnected', 'isNodeConnected INTEGER DEFAULT 0');
  addColumnIfNotExists('usedReferralCode', 'usedReferralCode TEXT');
  addColumnIfNotExists('discordId', 'discordId TEXT');
  addColumnIfNotExists('discordUsername', 'discordUsername TEXT'); // Thêm
  addColumnIfNotExists('discordAvatar', 'discordAvatar TEXT');     // Thêm
});

const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Token required' });

  const token = authHeader.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

const generateRandomCode = () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
};

const createUniqueReferralCode = (callback) => {
  const code = generateRandomCode();
  db.get(`SELECT referralCode FROM users WHERE referralCode = ?`, [code], (err, row) => {
    if (err) {
      console.error('Error checking referralCode:', err);
      callback(err);
    } else if (row) {
      createUniqueReferralCode(callback);
    } else {
      callback(null, code);
    }
  });
};

function calculateTierAndPoints(totalPoints) {
  if (totalPoints >= 10000) return { tier: 'Tier 5', points: 5000 };
  if (totalPoints >= 6000) return { tier: 'Tier 4', points: 2500 };
  if (totalPoints >= 3000) return { tier: 'Tier 3', points: 1000 };
  if (totalPoints >= 1000) return { tier: 'Tier 2', points: 500 };
  if (totalPoints >= 200) return { tier: 'Tier 1', points: 100 };
  return { tier: 'None', points: 0 };
}

const formatDate = (date) => {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  let publicKey = null;

  socket.on('join', (key) => {
    publicKey = key;
    socket.join(publicKey);

    db.run(
      `UPDATE users SET lastConnected = ? WHERE publicKey = ?`,
      [Date.now(), publicKey],
      (err) => {
        if (err) console.error('Error updating lastConnected:', err);
      }
    );
  });

  socket.on('node-connect', (key) => {
    publicKey = key;
    db.run(
      `UPDATE users SET isNodeConnected = 1 WHERE publicKey = ?`,
      [publicKey],
      (err) => {
        if (err) console.error('Error setting node connected:', err);
      }
    );

    const interval = setInterval(() => {
      db.get(`SELECT * FROM users WHERE publicKey = ? AND isNodeConnected = 1`, [publicKey], (err, row) => {
        if (err || !row) {
          console.error('Error fetching user or node not connected:', err || 'No row');
          return;
        }

        const hoursToday = row.hoursToday + 0.00139;
        const pointsPerHour = 10;
        const todayPoints = Math.floor(hoursToday * pointsPerHour);
        const { tier, points: tierPoints } = calculateTierAndPoints(row.totalPoints);

        const today = new Date();
        const todayStr = formatDate(today);
        db.run(
          `INSERT OR REPLACE INTO daily_points (wallet, date, points) VALUES (?, ?, ?)`,
          [publicKey, todayStr, todayPoints],
          (err) => {
            if (err) console.error('Error saving daily points:', err);
          }
        );

        const labels = [];
        for (let i = 13; i >= 0; i--) {
          const date = new Date(today);
          date.setDate(today.getDate() - i);
          labels.push(formatDate(date));
        }
        db.all(
          `SELECT date, points FROM daily_points WHERE wallet = ? AND date IN (${labels.map(() => '?').join(',')})`,
          [publicKey, ...labels],
          (err, rows) => {
            if (err) {
              console.error('Error fetching daily points:', err);
              return;
            }
            const dailyPoints = Array(14).fill(0);
            rows.forEach((row) => {
              const index = labels.indexOf(row.date);
              if (index >= 0) dailyPoints[index] = row.points;
            });

            db.get(
              `SELECT SUM(points) as totalPoints FROM daily_points WHERE wallet = ?`,
              [publicKey],
              (err, sumRow) => {
                if (err) {
                  console.error('Error calculating totalPoints:', err);
                  return;
                }

                db.get(
                  `SELECT COUNT(DISTINCT date) as daysSeason1 FROM daily_points WHERE wallet = ?`,
                  [publicKey],
                  (err, countRow) => {
                    if (err) {
                      console.error('Error calculating daysSeason1:', err);
                      return;
                    }

                    const totalPoints = sumRow.totalPoints || 0;
                    const daysSeason1 = countRow.daysSeason1 || 0;

                    db.run(
                      `UPDATE users SET
                        hoursToday = ?,
                        todayPoints = ?,
                        totalPoints = ?,
                        daysSeason1 = ?,
                        currentTier = ?
                      WHERE publicKey = ?`,
                      [hoursToday, todayPoints, totalPoints + tierPoints, daysSeason1, tier, publicKey],
                      (err) => {
                        if (err) console.error('Error updating user:', err);
                        else {
                          io.to(publicKey).emit('points-update', {
                            totalPoints: totalPoints + tierPoints,
                            todayPoints,
                            hoursToday,
                            daysSeason1,
                            referralsCount: row.referralsCount,
                            currentTier: tier,
                            dailyPoints,
                            networkStrength: row.isNodeConnected ? 4 : 0,
                          });
                          io.emit('leaderboard-update', { publicKey, totalPoints: totalPoints + tierPoints });
                        }
                      }
                    );
                  }
                );
              }
            );
          }
        );
      });
    }, 5000);

    socket.on('node-disconnect', () => {
      db.run(
        `UPDATE users SET isNodeConnected = 0 WHERE publicKey = ?`,
        [publicKey],
        (err) => {
          if (err) console.error('Error setting node disconnected:', err);
        }
      );
      clearInterval(interval);
    });

    socket.on('disconnect', () => {
      clearInterval(interval);
      db.run(
        `UPDATE users SET lastConnected = NULL, isNodeConnected = 0 WHERE publicKey = ?`,
        [publicKey],
        (err) => {
          if (err) console.error('Error updating disconnect:', err);
        }
      );
    });
  });
});

cron.schedule('0 0 * * *', () => {
  console.log('Running daily reset at 00:00 UTC');
  db.run(
    `UPDATE users SET todayPoints = 0, hoursToday = 0`,
    (err) => {
      if (err) {
        console.error('Error resetting todayPoints and hoursToday:', err);
      } else {
        console.log('Successfully reset todayPoints and hoursToday');
        io.emit('points-update', { reset: true });
      }
    }
  );
}, {
  timezone: 'UTC'
});

// Discord

const { Client, IntentsBitField } = require('discord.js');

const discordClient = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
  ],
});

discordClient.login(process.env.DISCORD_BOT_TOKEN).then(() => {
  console.log('Discord client for role assignment logged in');
});

const TIER_ROLES = {
  'Tier 1': process.env.DISCORD_TIER1_ROLE_ID,
  'Tier 2': process.env.DISCORD_TIER2_ROLE_ID,
  'Tier 3': process.env.DISCORD_TIER3_ROLE_ID,
  'Tier 4': process.env.DISCORD_TIER4_ROLE_ID,
  'Tier 5': process.env.DISCORD_TIER5_ROLE_ID,
};

async function assignRole(discordId, tier) {
  if (!discordId || !tier || tier === 'None') return;

  const guild = discordClient.guilds.cache.get(process.env.DISCORD_GUILD_ID);
  if (!guild) {
    console.error('Guild not found');
    return;
  }

  const member = await guild.members.fetch(discordId).catch((err) => {
    console.error('Error fetching member:', err);
    return null;
  });
  if (!member) return;

  const roleId = TIER_ROLES[tier];
  if (!roleId) {
    console.error(`No role defined for tier: ${tier}`);
    return;
  }

  const role = guild.roles.cache.get(roleId);
  if (!role) {
    console.error(`Role not found for ID: ${roleId}`);
    return;
  }

  try {
    // Remove old tier roles
    for (const existingRoleId of Object.values(TIER_ROLES)) {
      if (member.roles.cache.has(existingRoleId)) {
        await member.roles.remove(existingRoleId);
        console.log(`Removed role ${existingRoleId} from ${discordId}`);
      }
    }

    // Add new role
    await member.roles.add(roleId);
    console.log(`Assigned role ${role.name} to ${discordId} for tier ${tier}`);
  } catch (err) {
    console.error(`Error assigning role to ${discordId}:`, err);
  }
}

// API

app.post('/api/auth/sign', async (req, res) => {
  const { publicKey, signature, referralCode } = req.body;
  if (!publicKey || !signature) {
    console.error('Missing publicKey or signature:', { publicKey, signature });
    return res.status(400).json({ error: 'Missing publicKey or signature' });
  }

  try {
    db.get(
      `SELECT referralCode, referralLink, referralsCount, totalPoints, todayPoints, hoursToday, daysSeason1, currentTier, isNodeConnected, usedReferralCode FROM users WHERE publicKey = ?`,
      [publicKey],
      async (err, existingUser) => {
        if (err) {
          console.error('Error checking existing user:', err);
          return res.status(500).json({ error: 'Database error' });
        }
        console.log('Existing user:', existingUser);

        let userReferralCode, referralLink;

        if (existingUser && existingUser.referralCode) {
          userReferralCode = existingUser.referralCode;
          referralLink = existingUser.referralLink;
          console.log('Using existing referralCode:', userReferralCode);
        } else {
          try {
            userReferralCode = await new Promise((resolve, reject) => {
              createUniqueReferralCode((err, newCode) => {
                if (err) reject(err);
                resolve(newCode);
              });
            });
            referralLink = `https://sailabs.xyz/ref/${userReferralCode}`;
            console.log('Generated new referralCode:', userReferralCode);

            await new Promise((resolve, reject) => {
              db.run(
                `INSERT OR REPLACE INTO users (
                  publicKey, referralCode, referralLink, lastConnected, isNodeConnected, 
                  totalPoints, todayPoints, hoursToday, daysSeason1, referralsCount, currentTier, usedReferralCode
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  publicKey,
                  userReferralCode,
                  referralLink,
                  Date.now(),
                  existingUser ? existingUser.isNodeConnected || 0 : 0,
                  existingUser ? existingUser.totalPoints || 0 : 0,
                  existingUser ? existingUser.todayPoints || 0 : 0,
                  existingUser ? existingUser.hoursToday || 0 : 0,
                  existingUser ? existingUser.daysSeason1 || 0 : 0,
                  existingUser ? existingUser.referralsCount || 0 : 0,
                  existingUser ? existingUser.currentTier || 'None' : 'None',
                  existingUser ? existingUser.usedReferralCode || null : null,
                ],
                (err) => {
                  if (err) reject(err);
                  resolve();
                }
              );
            });
            console.log('User created/updated:', publicKey);
          } catch (err) {
            console.error('Error creating or updating user:', err);
            return res.status(500).json({ error: 'Failed to create or update user' });
          }
        }

        const saveSignatureAndProceed = async () => {
          const timestamp = Date.now();
          await new Promise((resolve, reject) => {
            db.run(
              `INSERT OR REPLACE INTO signatures (publicKey, signature, timestamp) VALUES (?, ?, ?)`,
              [publicKey, signature, timestamp],
              (err) => {
                if (err) reject(err);
                resolve();
              }
            );
          });
          console.log('Signature saved for:', publicKey);

          await new Promise((resolve, reject) => {
            db.run(
              `UPDATE users SET lastConnected = ? WHERE publicKey = ?`,
              [Date.now(), publicKey],
              (err) => {
                if (err) reject(err);
                resolve();
              }
            );
          });

          if (referralCode && referralCode !== userReferralCode && (!existingUser || !existingUser.usedReferralCode)) {
            try {
              const referrer = await new Promise((resolve, reject) => {
                db.get(
                  `SELECT publicKey, referralsCount, totalPoints, todayPoints, hoursToday, daysSeason1, isNodeConnected FROM users WHERE referralCode = ?`,
                  [referralCode],
                  (err, row) => {
                    if (err) reject(err);
                    resolve(row);
                  }
                );
              });

              if (referrer) {
                const newReferralsCount = (referrer.referralsCount || 0) + 1;
                const referralPoints = REFERRAL_POINTS_PER_USER;
                const newTotalPoints = (referrer.totalPoints || 0) + referralPoints;
                const { tier } = calculateTierAndPoints(newTotalPoints);

                await new Promise((resolve, reject) => {
                  db.serialize(() => {
                    db.run('BEGIN TRANSACTION');
                    db.run(
                      `UPDATE users SET
                        referralsCount = ?,
                        currentTier = ?,
                        todayPoints = todayPoints + ?,
                        totalPoints = ?
                      WHERE publicKey = ?`,
                      [newReferralsCount, tier, referralPoints, newTotalPoints, referrer.publicKey],
                      (err) => {
                        if (err) {
                          db.run('ROLLBACK');
                          reject(err);
                        }
                      }
                    );
                    const today = new Date();
                    const todayStr = formatDate(today);
                    db.run(
                      `INSERT OR REPLACE INTO daily_points (wallet, date, points) VALUES (?, ?, ?)`,
                      [referrer.publicKey, todayStr, (referrer.todayPoints || 0) + referralPoints],
                      (err) => {
                        if (err) {
                          db.run('ROLLBACK');
                          reject(err);
                        }
                      }
                    );
                    db.run('COMMIT', (err) => {
                      if (err) reject(err);
                      resolve();
                    });
                  });
                });
                console.log(`Referrer ${referrer.publicKey}: Added ${referralPoints} points, newTotalPoints=${newTotalPoints}, newTier=${tier}`);

                const today = new Date();
                const labels = [];
                for (let i = 13; i >= 0; i--) {
                  const date = new Date(today);
                  date.setDate(today.getDate() - i);
                  labels.push(formatDate(date));
                }
                const dailyRows = await new Promise((resolve, reject) => {
                  db.all(
                    `SELECT date, points FROM daily_points WHERE wallet = ? AND date IN (${labels.map(() => '?').join(',')})`,
                    [referrer.publicKey, ...labels],
                    (err, rows) => {
                      if (err) reject(err);
                      resolve(rows);
                    }
                  );
                });
                const dailyPoints = Array(14).fill(0);
                dailyRows.forEach((row) => {
                  const index = labels.indexOf(row.date);
                  if (index >= 0) dailyPoints[index] = row.points;
                });

                io.to(referrer.publicKey).emit('points-update', {
                  totalPoints: newTotalPoints,
                  todayPoints: (referrer.todayPoints || 0) + referralPoints,
                  hoursToday: referrer.hoursToday || 0,
                  daysSeason1: referrer.daysSeason1 || 0,
                  referralsCount: newReferralsCount,
                  currentTier: tier,
                  dailyPoints,
                  networkStrength: referrer.isNodeConnected ? 4 : 0,
                });
                io.emit('leaderboard-update', {
                  publicKey: referrer.publicKey,
                  totalPoints: newTotalPoints,
                });

                await new Promise((resolve, reject) => {
                  db.run(
                    `UPDATE users SET usedReferralCode = ? WHERE publicKey = ?`,
                    [referralCode, publicKey],
                    (err) => {
                      if (err) reject(err);
                      resolve();
                    }
                  );
                });

                db.get(`SELECT discordId FROM users WHERE publicKey = ?`, [referrer.publicKey], (err, row) => {
                  if (err) console.error('Error fetching referrer discordId:', err);
                  else if (row && row.discordId) assignRole(row.discordId, tier);
                });
                console.log(`Saved usedReferralCode ${referralCode} for user ${publicKey}`);
              } else {
                console.warn(`Referral code ${referralCode} not found`);
              }
            } catch (err) {
              console.error('Error processing referral:', err);
            }
          }

          const token = jwt.sign({ publicKey }, JWT_SECRET, { expiresIn: '24h' });
          res.json({ token });
        };

        try {
          await saveSignatureAndProceed();
        } catch (err) {
          console.error('Error saving signature or updating user:', err);
          res.status(500).json({ error: 'Failed to save signature or update user' });
        }
      }
    );
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

app.post('/api/link-discord', authenticateJWT, (req, res) => {
  const { discordId } = req.body;
  const publicKey = req.user.publicKey;

  if (!discordId) {
    return res.status(400).json({ error: 'Discord ID is required' });
  }

  db.get(
    `SELECT currentTier FROM users WHERE publicKey = ?`,
    [publicKey],
    (err, row) => {
      if (err) {
        console.error('Error checking user:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      if (!row) {
        return res.status(404).json({ error: 'User not found' });
      }

      db.run(
        `UPDATE users SET discordId = ? WHERE publicKey = ?`,
        [discordId, publicKey],
        (err) => {
          if (err) {
            console.error('Error saving discordId:', err);
            return res.status(500).json({ error: 'Failed to link Discord ID' });
          }
          res.json({ success: true, message: 'Discord ID linked successfully' });
        }
      );
    }
  );
});

// Reload role 

app.post('/api/discord/reload-role', authenticateJWT, async (req, res) => {
  const publicKey = req.user.publicKey;

  try {
    const user = await new Promise((resolve, reject) => {
      db.get(
        `SELECT discordId, currentTier FROM users WHERE publicKey = ?`,
        [publicKey],
        (err, row) => {
          if (err) reject(err);
          resolve(row);
        }
      );
    });

    if (!user || !user.discordId) {
      return res.status(400).json({ error: 'No Discord account linked' });
    }

    if (user.currentTier && user.currentTier !== 'None') {
      await assignRole(user.discordId, user.currentTier);
    }

    res.json({ success: true, message: 'Discord role reloaded successfully' });
  } catch (err) {
    console.error('Error reloading Discord role:', err);
    res.status(500).json({ error: 'Failed to reload Discord role' });
  }
});

app.post('/api/referrals/validate', async (req, res) => {
  const { referralCode } = req.body;
  if (!referralCode) {
    console.error('Referral code missing in request:', req.body);
    return res.status(400).json({ success: false, error: 'Referral code is required' });
  }

  try {
    const row = await new Promise((resolve, reject) => {
      db.get(
        `SELECT 1 FROM users WHERE referralCode = ?`,
        [referralCode],
        (err, row) => {
          if (err) reject(err);
          resolve(row);
        }
      );
    });

    if (row) {
      console.log(`Referral code ${referralCode} is valid`);
      return res.status(200).json({ success: true, message: 'Referral code is valid' });
    } else {
      console.log(`Referral code ${referralCode} not found`);
      return res.status(404).json({ success: false, error: 'Referral code not found' });
    }
  } catch (error) {
    console.error('Error validating referral code:', error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/user-stats', authenticateJWT, (req, res) => {
  const publicKey = req.user.publicKey;
  db.get(
    `SELECT * FROM users WHERE publicKey = ?`,
    [publicKey],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'Failed to fetch stats' });
      if (!row) return res.status(404).json({ error: 'User not found' });

      const today = new Date();
      const labels = [];
      for (let i = 13; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        labels.push(formatDate(date));
      }

      db.all(
        `SELECT date, points FROM daily_points WHERE wallet = ? AND date IN (${labels.map(() => '?').join(',')})`,
        [publicKey, ...labels],
        (err, rows) => {
          if (err) {
            console.error('Error fetching daily points:', err);
            return res.status(500).json({ error: 'Failed to fetch daily points' });
          }
          const dailyPoints = Array(14).fill(0);
          rows.forEach((row) => {
            const index = labels.indexOf(row.date);
            if (index >= 0) dailyPoints[index] = row.points;
          });

          db.get(
            `SELECT SUM(points) as totalPoints FROM daily_points WHERE wallet = ?`,
            [publicKey],
            (err, sumRow) => {
              if (err) {
                console.error('Error calculating totalPoints:', err);
                return res.status(500).json({ error: 'Failed to calculate totalPoints' });
              }

              db.get(
                `SELECT COUNT(DISTINCT date) as daysSeason1 FROM daily_points WHERE wallet = ?`,
                [publicKey],
                (err, countRow) => {
                  if (err) {
                    console.error('Error calculating daysSeason1:', err);
                    return res.status(500).json({ error: 'Failed to calculate daysSeason1' });
                  }

                  const totalPoints = sumRow.totalPoints || 0;
                  const daysSeason1 = countRow.daysSeason1 || 0;
                  const { tier } = calculateTierAndPoints(totalPoints);

                  db.run(
                    `UPDATE users SET totalPoints = ?, currentTier = ? WHERE publicKey = ?`,
                    [totalPoints, tier, publicKey],
                    (err) => {
                      if (err) {
                        console.error('Error updating user stats:', err);
                      }
                    }
                  );

                  res.json({
                    dailyPoints,
                    totalPoints,
                    todayPoints: row.todayPoints || 0,
                    hoursToday: row.hoursToday || 0,
                    daysSeason1,
                    networkStrength: row.isNodeConnected ? 4 : 0,
                    referralsCount: row.referralsCount || 0,
                    currentTier: tier,
                    referralCode: row.referralCode || '',
                    referralLink: row.referralLink || '',
                  });
                }
              );
            }
          );
        }
      );
    }
  );
});

app.get('/api/discord/status', authenticateJWT, (req, res) => {
  const publicKey = req.user.publicKey;
  db.get(
    `SELECT discordId, discordUsername, discordAvatar FROM users WHERE publicKey = ?`,
    [publicKey],
    (err, row) => {
      if (err) {
        console.error('Error fetching Discord status:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.json({
        isLinked: !!row?.discordId,
        username: row?.discordUsername || '',
        avatar: row?.discordAvatar || ''
      });
    }
  );
});

app.post('/api/discord/disconnect', authenticateJWT, async (req, res) => {
  const publicKey = req.user.publicKey;

  try {
    // Fetch discordId before removing
    const user = await new Promise((resolve, reject) => {
      db.get(
        `SELECT discordId FROM users WHERE publicKey = ?`,
        [publicKey],
        (err, row) => {
          if (err) reject(err);
          resolve(row);
        }
      );
    });

    if (user && user.discordId) {
      // Remove tier roles from Discord
      const guild = discordClient.guilds.cache.get(process.env.DISCORD_GUILD_ID);
      if (guild) {
        const member = await guild.members.fetch(user.discordId).catch((err) => {
          console.error('Error fetching member:', err);
          return null;
        });
        if (member) {
          for (const roleId of Object.values(TIER_ROLES)) {
            if (member.roles.cache.has(roleId)) {
              await member.roles.remove(roleId).catch((err) => {
                console.error(`Error removing role ${roleId}:`, err);
              });
              console.log(`Removed role ${roleId} from ${user.discordId}`);
            }
          }
        }
      }
    }

    // Remove discord info from database
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE users SET discordId = NULL, discordUsername = NULL, discordAvatar = NULL WHERE publicKey = ?`,
        [publicKey],
        (err) => {
          if (err) reject(err);
          resolve();
        }
      );
    });

    res.json({ success: true, message: 'Discord disconnected successfully' });
  } catch (err) {
    console.error('Error disconnecting Discord:', err);
    res.status(500).json({ error: 'Failed to disconnect Discord' });
  }
});

app.post('/api/save-points', (req, res) => {
  const { wallet, date, points } = req.body;
  if (!wallet || !date || points == null) {
    return res.status(400).json({ success: false, error: 'Missing required fields' });
  }

  db.run(
    `INSERT OR REPLACE INTO daily_points (wallet, date, points) VALUES (?, ?, ?)`,
    [wallet, date, points],
    (err) => {
      if (err) {
        console.error('Error saving points to daily_points:', err);
        return res.status(500).json({ success: false, error: 'Database error' });
      }
      db.get(
        `SELECT SUM(points) as totalPoints FROM daily_points WHERE wallet = ?`,
        [wallet],
        (err, sumRow) => {
          if (err) {
            console.error('Error calculating totalPoints:', err);
            return;
          }
          const totalPoints = sumRow.totalPoints || 0;
          db.run(
            `UPDATE users SET totalPoints = ? WHERE publicKey = ?`,
            [totalPoints, wallet],
            (err) => {
              if (err) console.error('Error updating totalPoints:', err);
              res.json({ success: true });
            }
          );
        }
      );
    }
  );
});

app.get('/api/daily-points', authenticateJWT, (req, res) => {
  const { wallet } = req.query;
  if (wallet !== req.user.publicKey) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const today = new Date();
  const labels = [];
  for (let i = 13; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    labels.push(formatDate(date));
  }

  db.all(
    `SELECT date, points FROM daily_points WHERE wallet = ? AND date IN (${labels.map(() => '?').join(',')})`,
    [wallet, ...labels],
    (err, rows) => {
      if (err) {
        console.error('Error fetching daily points:', err);
        return res.status(500).json({ error: 'Failed to fetch daily points' });
      }
      const dailyPoints = Array(14).fill(0);
      rows.forEach((row) => {
        const index = labels.indexOf(row.date);
        if (index >= 0) dailyPoints[index] = row.points;
      });
      res.json({ dailyPoints });
    }
  );
});

app.get('/api/referrals/info', authenticateJWT, (req, res) => {
  const publicKey = req.query.publicKey;
  if (!publicKey || publicKey !== req.user.publicKey) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  db.get(
    `SELECT referralCode, referralLink, referralsCount, currentTier
     FROM users WHERE publicKey = ?`,
    [publicKey],
    (err, row) => {
      if (err) {
        console.error('Error fetching referral info:', err);
        return res.status(500).json({ error: 'Failed to fetch referral info' });
      }
      if (!row) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json({
        code: row.referralCode,
        link: row.referralLink,
        referralsCount: row.referralsCount,
        currentTier: row.currentTier,
      });
    }
  );
});

app.get('/api/referrals/ranking', authenticateJWT, (req, res) => {
  db.all(
    `SELECT publicKey AS wallet, referralsCount AS referrals
     FROM users WHERE referralsCount > 0`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Failed to fetch referral ranking' });
      res.json(rows);
    }
  );
});

app.post('/api/referrals/update', (req, res) => {
  const { publicKey, referredBy } = req.body;

  if (!publicKey || !referredBy) {
    return res.status(400).json({ error: 'Missing publicKey or referredBy' });
  }

  db.get(`SELECT referralCode FROM users WHERE publicKey = ?`, [referredBy], (err, referrer) => {
    if (err) {
      console.error('Error checking referrer:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (!referrer) {
      return res.status(400).json({ error: 'Invalid referral code' });
    }

    db.get(`SELECT usedReferralCode FROM users WHERE publicKey = ?`, [publicKey], (err, user) => {
      if (err) {
        console.error('Error checking user:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      if (user && user.usedReferralCode) {
        return res.status(400).json({ error: 'User has already used a referral code' });
      }

      const pointsToAdd = 100;
      const today = new Date();
      const todayStr = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;

      db.run(
        `UPDATE users SET usedReferralCode = ?, totalPoints = totalPoints + ?, referralsCount = referralsCount + 1 WHERE publicKey = ?`,
        [referrer.referralCode, pointsToAdd, referredBy],
        (err) => {
          if (err) {
            console.error('Error updating referrer:', err);
            return res.status(500).json({ error: 'Database error' });
          }

          const tier = calculateTierAndPoints(pointsToAdd).tier; // Fixed: Use calculateTierAndPoints
          db.run(
            `UPDATE users SET currentTier = ? WHERE publicKey = ?`,
            [tier, referredBy],
            (err) => {
              if (err) {
                console.error('Error updating tier:', err);
                return res.status(500).json({ error: 'Database error' });
              }

              db.run(
                `INSERT OR REPLACE INTO daily_points (wallet, date, points) VALUES (?, ?, ?)`,
                [referredBy, todayStr, pointsToAdd],
                (err) => {
                  if (err) {
                    console.error('Error saving daily points:', err);
                    return res.status(500).json({ error: 'Database error' });
                  }

                  db.get(
                    `SELECT discordId, totalPoints, referralsCount, currentTier FROM users WHERE publicKey = ?`,
                    [referredBy],
                    (err, updatedUser) => {
                      if (err) {
                        console.error('Error fetching updated user:', err);
                        return res.status(500).json({ error: 'Database error' });
                      }

                      console.log(`Referrer ${referredBy}: Added ${pointsToAdd} points, newTotalPoints=${updatedUser.totalPoints}, newTier=${updatedUser.currentTier}`);
                      io.emit('points-update', {
                        publicKey: referredBy,
                        totalPoints: updatedUser.totalPoints,
                        referralsCount: updatedUser.referralsCount,
                        currentTier: updatedUser.currentTier,
                      });

                      if (updatedUser.discordId) {
                        assignRole(updatedUser.discordId, updatedUser.currentTier);
                      }

                      res.json({ success: true });
                    }
                  );
                }
              );
            }
          );
        }
      );
    });
  });
});

app.get('/api/leaderboard', authenticateJWT, (req, res) => {
  db.all(
    `SELECT publicKey AS wallet, totalPoints AS points
     FROM users WHERE totalPoints > 0`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Failed to fetch leaderboard' });
      res.json(rows);
    }
  );
});

// Endpoint to initiate OAuth flow
app.get('/api/discord/login', authenticateJWT, (req, res) => {
  const publicKey = req.user.publicKey;
  const redirectUri = encodeURIComponent('https://sailabs.xyz/api/discord/callback');
  const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.DISCORD_CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&scope=identify&state=${publicKey}`;
  res.json({ oauthUrl });
});

// Endpoint to handle callback from Discord
app.get('/api/discord/callback', async (req, res) => {
  const { code, state: publicKey, error } = req.query;

  if (error === 'access_denied') {
    console.log('User cancelled Discord OAuth, redirecting to dashboard');
    return res.redirect('https://sailabs.xyz/dashboard?discord_linked=true&tab=profile');
  }

  if (!code || !publicKey) {
    console.error('Missing code or publicKey in callback:', req.query);
    return res.redirect('https://sailabs.xyz/dashboard?discord_error=cancelled&tab=profile');
  }

  try {
    console.log('Exchanging code for access token, publicKey:', publicKey);
    const tokenResponse = await axios.post(
      'https://discord.com/api/oauth2/token',
      new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'http://localhost:3000/api/discord/callback',
        scope: 'identify',
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    const { access_token } = tokenResponse.data;
    console.log('Received access token for', publicKey);

    const userResponse = await axios.get('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const discordId = userResponse.data.id;
    const discordUsername = userResponse.data.discriminator === '0' 
      ? `@${userResponse.data.username}`
      : `@${userResponse.data.username}#${userResponse.data.discriminator}`;
    const discordAvatar = userResponse.data.avatar 
      ? `https://cdn.discordapp.com/avatars/${discordId}/${userResponse.data.avatar}.png?size=64`
      : null;

    console.log('Fetched Discord info:', { discordId, discordUsername, discordAvatar });

    db.run(
      `UPDATE users SET discordId = ?, discordUsername = ?, discordAvatar = ? WHERE publicKey = ?`,
      [discordId, discordUsername, discordAvatar, publicKey],
      (err) => {
        if (err) {
          console.error('Error saving Discord info:', err);
          return res.redirect('https://sailabs.xyz/dashboard?discord_linked=true&tab=profile');
        }

        db.get(
          `SELECT currentTier FROM users WHERE publicKey = ?`,
          [publicKey],
          (err, row) => {
            if (err) {
              console.error('Error fetching user:', err);
              return res.redirect('https://sailabs.xyz/dashboard?discord_linked=true&tab=profile');
            }

            console.log('User tier for', publicKey, ':', row.currentTier);
            if (row && row.currentTier && row.currentTier !== 'None') {
              assignRole(discordId, row.currentTier);
            }

            res.redirect('https://sailabs.xyz/dashboard?discord_linked=true&tab=profile');
          }
        );
      }
    );
  } catch (err) {
    console.error('Error in Discord OAuth callback:', err.message);
    res.redirect('https://sailabs.xyz/dashboard?discord_linked=true&tab=profile');
  }
});

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});