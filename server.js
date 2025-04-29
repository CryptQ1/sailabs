require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const cron = require('node-cron');
const path = require('path');
const crypto = require('crypto');

const app = express();
const port = 3000;
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  },
});

// Discord
const { Client, GatewayIntentBits } = require('discord.js');
const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

// Đăng nhập bot
discordClient.login(process.env.DISCORD_BOT_TOKEN).catch((err) => {
  console.error('Error logging in Discord bot:', err);
});

// Khi bot sẵn sàng
discordClient.once('ready', () => {
  console.log(`Discord bot logged in as ${discordClient.user.tag}`);
});

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';
const REFERRAL_POINTS_PER_USER = 100; // Điểm cố định cho mỗi referral

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Hàm cấp vai trò
const assignDiscordRole = async (discordId, tier) => {
  try {
    const guild = discordClient.guilds.cache.get(process.env.DISCORD_GUILD_ID);
    if (!guild) throw new Error('Guild not found');

    const member = await guild.members.fetch(discordId);
    if (!member) throw new Error('Member not found');

    // Xóa tất cả vai trò Tier hiện có
    const tierRoles = {
      'Tier 1': process.env.DISCORD_TIER1_ROLE_ID,
      'Tier 2': process.env.DISCORD_TIER2_ROLE_ID,
      'Tier 3': process.env.DISCORD_TIER3_ROLE_ID,
      'Tier 4': process.env.DISCORD_TIER4_ROLE_ID,
      'Tier 5': process.env.DISCORD_TIER5_ROLE_ID,
    };

    await member.roles.remove(Object.values(tierRoles).filter((roleId) => roleId));

    // Cấp vai trò tương ứng
    if (tier !== 'None' && tierRoles[tier]) {
      await member.roles.add(tierRoles[tier]);
    }

    return true;
  } catch (error) {
    console.error('Error assigning Discord role:', error);
    return false;
  }
};

// Kết nối SQLite
const db = new sqlite3.Database('./data.db', (err) => {
  if (err) console.error('Database connection error:', err);
  else console.log('Connected to SQLite database');
});

// Tạo bảng
db.serialize(() => {
  // Tạo bảng users
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
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
      discordId TEXT,
      usedReferralCode TEXT
    )
  `, (err) => {
    if (err) {
      console.error('Error creating users table:', err);
    } else {
      console.log('Users table created or already exists');
    }
  });

  // Tạo bảng signatures (bỏ khóa ngoại để tránh lỗi)
  db.run(`
    CREATE TABLE IF NOT EXISTS signatures (
      publicKey TEXT,
      signature TEXT,
      timestamp INTEGER
    )
  `, (err) => {
    if (err) {
      console.error('Error creating signatures table:', err);
    } else {
      console.log('Signatures table created or already exists');
    }
  });

  // Tạo bảng daily_points
  db.run(`
    CREATE TABLE IF NOT EXISTS daily_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet TEXT NOT NULL,
      date TEXT NOT NULL,
      points INTEGER NOT NULL,
      UNIQUE(wallet, date)
    )
  `, (err) => {
    if (err) {
      console.error('Error creating daily_points table:', err);
    } else {
      console.log('Daily_points table created or already exists');
    }
  });

  // Hàm kiểm tra và thêm cột nếu chưa có
  const addColumnIfNotExists = (columnName, columnDefinition) => {
    db.all(`PRAGMA table_info(users)`, (err, columns) => {
      if (err) {
        console.error(`Error checking users table schema for ${columnName}:`, err);
        return;
      }
      const columnNames = columns.map(col => col.name);
      if (!columnNames.includes(columnName)) {
        db.run(`ALTER TABLE users ADD COLUMN ${columnDefinition}`, (err) => {
          if (err) {
            console.error(`Error adding ${columnName} column:`, err);
          } else {
            console.log(`Added ${columnName} column`);
          }
        });
      } else {
        console.log(`${columnName} column already exists`);
      }
    });
  };

  // Kiểm tra và thêm các cột
  addColumnIfNotExists('lastConnected', 'lastConnected INTEGER');
  addColumnIfNotExists('isNodeConnected', 'isNodeConnected INTEGER DEFAULT 0');
  addColumnIfNotExists('discordId', 'discordId TEXT');
  addColumnIfNotExists('usedReferralCode', 'usedReferralCode TEXT');
});

// Middleware kiểm tra JWT
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

// Hàm tạo mã mời ngẫu nhiên
const generateRandomCode = () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return code;
};

// Hàm kiểm tra và tạo mã mời duy nhất
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

// Hàm tính tier và points dựa trên totalPoints
function calculateTierAndPoints(totalPoints) {
  if (totalPoints >= 10000) return { tier: 'Tier 5', points: 5000 };
  if (totalPoints >= 5000) return { tier: 'Tier 4', points: 2500 };
  if (totalPoints >= 1000) return { tier: 'Tier 3', points: 1000 };
  if (totalPoints >= 500) return { tier: 'Tier 2', points: 500 };
  if (totalPoints >= 100) return { tier: 'Tier 1', points: 100 };
  return { tier: 'None', points: 0 };
}

// Hàm định dạng ngày thành DD/MM/YYYY
const formatDate = (date) => {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

// WebSocket: Theo dõi kết nối và cập nhật points
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

// Cron Job: Reset todayPoints và hoursToday mỗi ngày vào 0 giờ UTC
cron.schedule('0 0 * * *', () => {
  console.log('Running daily reset at', new Date().toUTCString());

  // Reset todayPoints và hoursToday cho tất cả user
  db.run(`UPDATE users SET todayPoints = 0, hoursToday = 0`, (err) => {
    if (err) {
      console.error('Error resetting daily stats:', err);
      return;
    }
    console.log('Reset todayPoints and hoursToday for all users');

    // Lấy danh sách tất cả user để cập nhật các thông tin liên quan
    db.all(`SELECT publicKey, referralsCount, isNodeConnected FROM users`, [], (err, rows) => {
      if (err) {
        console.error('Error fetching users for reset:', err);
        return;
      }

      rows.forEach((row) => {
        const publicKey = row.publicKey;

        // Tính tổng totalPoints từ daily_points
        db.get(
          `SELECT SUM(points) as totalPoints, COUNT(DISTINCT date) as daysSeason1
           FROM daily_points WHERE wallet = ?`,
          [publicKey],
          (err, sumRow) => {
            if (err) {
              console.error('Error calculating totalPoints for', publicKey, err);
              return;
            }

            const totalPoints = sumRow.totalPoints || 0;
            const daysSeason1 = sumRow.daysSeason1 || 0;
            const { tier } = calculateTierAndPoints(totalPoints);

            // Lấy dữ liệu dailyPoints cho 14 ngày gần nhất
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
              (err, dailyRows) => {
                if (err) {
                  console.error('Error fetching daily points for', publicKey, err);
                  return;
                }

                const dailyPoints = Array(14).fill(0);
                dailyRows.forEach((dailyRow) => {
                  const index = labels.indexOf(dailyRow.date);
                  if (index >= 0) dailyPoints[index] = dailyRow.points;
                });

                // Cập nhật totalPoints, daysSeason1, currentTier vào database
                db.run(
                  `UPDATE users SET
                    totalPoints = ?,
                    daysSeason1 = ?,
                    currentTier = ?
                  WHERE publicKey = ?`,
                  [totalPoints, daysSeason1, tier, publicKey],
                  (err) => {
                    if (err) {
                      console.error('Error updating user stats for', publicKey, err);
                      return;
                    }

                    console.log(`Updated user ${publicKey}: totalPoints=${totalPoints}, currentTier=${tier}`);

                    // Gửi cập nhật qua WebSocket
                    io.to(publicKey).emit('points-update', {
                      totalPoints,
                      todayPoints: 0,
                      hoursToday: 0,
                      daysSeason1,
                      referralsCount: row.referralsCount || 0,
                      currentTier: tier,
                      dailyPoints,
                      networkStrength: row.isNodeConnected ? 4 : 0,
                    });
                    io.emit('leaderboard-update', { publicKey, totalPoints });
                  }
                );
              }
            );
          }
        );
      });
    });
  });
}, {
  timezone: 'UTC', // Reset vào 0 giờ UTC
});

// API: Xác thực ví và phát hành JWT
// API: Xác thực ví và phát hành JWT
app.post('/api/auth/sign', async (req, res) => {
  const { publicKey, signature, referralCode } = req.body;
  if (!publicKey || !signature) {
    console.error('Missing publicKey or signature:', { publicKey, signature });
    return res.status(400).json({ error: 'Missing publicKey or signature' });
  }

  try {
    db.get(
      `SELECT referralCode, referralLink, referralsCount, totalPoints, todayPoints, hoursToday, daysSeason1, currentTier, discordId, isNodeConnected, usedReferralCode FROM users WHERE publicKey = ?`,
      [publicKey],
      (err, existingUser) => {
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
          createUniqueReferralCode((err, newCode) => {
            if (err) {
              console.error('Error generating referralCode:', err);
              return res.status(500).json({ error: 'Failed to generate referral code' });
            }
            userReferralCode = newCode;
            referralLink = `https://nexusai.com/ref/${userReferralCode}`;
            console.log('Generated new referralCode:', userReferralCode);

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
                if (err) {
                  console.error('Error creating or updating user:', err);
                  return res.status(500).json({ error: 'Failed to create or update user' });
                }
                console.log('User created/updated:', publicKey);
                saveSignatureAndProceed();
              }
            );
          });
          return;
        }

        const saveSignatureAndProceed = () => {
          const timestamp = Date.now();
          db.run(
            `INSERT OR REPLACE INTO signatures (publicKey, signature, timestamp) VALUES (?, ?, ?)`,
            [publicKey, signature, timestamp],
            (err) => {
              if (err) {
                console.error('Error saving signature:', err);
                return res.status(500).json({ error: 'Failed to save signature' });
              }
              console.log('Signature saved for:', publicKey);

              db.run(
                `UPDATE users SET lastConnected = ? WHERE publicKey = ?`,
                [Date.now(), publicKey],
                (err) => {
                  if (err) {
                    console.error('Error updating lastConnected:', err);
                    return res.status(500).json({ error: 'Failed to update user' });
                  }

                  // Xử lý referralCode nếu có và người dùng chưa sử dụng mã mời
                  if (referralCode && referralCode !== userReferralCode && (!existingUser || !existingUser.usedReferralCode)) {
                    db.get(
                      `SELECT publicKey, referralsCount, totalPoints, todayPoints, discordId FROM users WHERE referralCode = ?`,
                      [referralCode],
                      (err, referrer) => {
                        if (err) {
                          console.error('Error fetching referrer:', err);
                          return;
                        }
                        if (referrer) {
                          const newReferralsCount = (referrer.referralsCount || 0) + 1;
                          const referralPoints = REFERRAL_POINTS_PER_USER; // 50 points
                          const newTotalPoints = (referrer.totalPoints || 0) + referralPoints;
                          const { tier } = calculateTierAndPoints(newTotalPoints);

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
                                console.error('Error updating referrer:', err);
                                return;
                              }
                              console.log(`Referrer ${referrer.publicKey}: Added ${referralPoints} points, newTotalPoints=${newTotalPoints}, newTier=${tier}`);

                              const today = new Date();
                              const todayStr = formatDate(today);
                              db.run(
                                `INSERT OR REPLACE INTO daily_points (wallet, date, points) VALUES (?, ?, ?)`,
                                [referrer.publicKey, todayStr, (referrer.todayPoints || 0) + referralPoints],
                                (err) => {
                                  if (err) console.error('Error saving referrer daily points:', err);
                                }
                              );

                              if (referrer.discordId) {
                                assignDiscordRole(referrer.discordId, tier).catch((err) => {
                                  console.error('Error updating Discord role for referrer:', err);
                                });
                              }

                              io.to(referrer.publicKey).emit('points-update', {
                                totalPoints: newTotalPoints,
                                todayPoints: (referrer.todayPoints || 0) + referralPoints,
                                hoursToday: referrer.hoursToday || 0,
                                daysSeason1: referrer.daysSeason1 || 0,
                                referralsCount: newReferralsCount,
                                currentTier: tier,
                              });
                              io.emit('leaderboard-update', {
                                publicKey: referrer.publicKey,
                                totalPoints: newTotalPoints,
                              });

                              // Lưu mã mời đã sử dụng vào usedReferralCode
                              db.run(
                                `UPDATE users SET usedReferralCode = ? WHERE publicKey = ?`,
                                [referralCode, publicKey],
                                (err) => {
                                  if (err) {
                                    console.error('Error saving usedReferralCode:', err);
                                  }
                                  console.log(`Saved usedReferralCode ${referralCode} for user ${publicKey}`);
                                }
                              );
                            }
                          );
                        }
                      }
                    );
                  }

                  const token = jwt.sign({ publicKey }, JWT_SECRET, { expiresIn: '24h' });
                  res.json({ token });
                }
              );
            }
          );
        };

        saveSignatureAndProceed();
      }
    );
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// API: Cập nhật Discord ID

app.post('/api/update-discord-id', authenticateJWT, async (req, res) => {
  const { publicKey, discordId } = req.body;
  if (!publicKey || !discordId) {
    return res.status(400).json({ error: 'Missing publicKey or discordId' });
  }
  if (publicKey !== req.user.publicKey) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    // Kiểm tra xem discordId đã được gán cho publicKey khác chưa
    db.get(
      `SELECT publicKey FROM users WHERE discordId = ? AND publicKey != ?`,
      [discordId, publicKey],
      (err, row) => {
        if (err) {
          console.error('Error checking existing discordId:', err);
          return res.status(500).json({ error: 'Failed to check discordId' });
        }
        if (row) {
          return res.status(400).json({
            error: 'This Discord account is already linked to another wallet. Please disconnect it from the other wallet first.',
          });
        }

        // Cập nhật discordId
        db.run(
          `UPDATE users SET discordId = ? WHERE publicKey = ?`,
          [discordId, publicKey],
          (err) => {
            if (err) {
              console.error('Error updating discordId:', err);
              return res.status(500).json({ error: 'Failed to update discordId' });
            }
            console.log(`Linked discordId ${discordId} to publicKey ${publicKey}`);
            res.json({ success: true });
          }
        );
      }
    );
  } catch (error) {
    console.error('Error updating discordId:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Ngắt kết nối Discord
app.post('/api/disconnect-discord', authenticateJWT, async (req, res) => {
  const { publicKey } = req.body;
  if (!publicKey) {
    return res.status(400).json({ error: 'Missing publicKey' });
  }
  if (publicKey !== req.user.publicKey) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    db.run(
      `UPDATE users SET discordId = NULL WHERE publicKey = ?`,
      [publicKey],
      (err) => {
        if (err) {
          console.error('Error disconnecting discordId:', err);
          return res.status(500).json({ error: 'Failed to disconnect Discord' });
        }
        console.log(`Disconnected Discord for publicKey ${publicKey}`);
        res.json({ success: true });
      }
    );
  } catch (error) {
    console.error('Error disconnecting Discord:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// API: Cập nhật vai trò Discord
app.post('/api/discord/update-roles', authenticateJWT, async (req, res) => {
  const { publicKey } = req.body;
  if (!publicKey || publicKey !== req.user.publicKey) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    db.get(
      `SELECT discordId, currentTier FROM users WHERE publicKey = ?`,
      [publicKey],
      async (err, row) => {
        if (err) {
          console.error('Error fetching user:', err);
          return res.status(500).json({ error: 'Failed to fetch user' });
        }
        if (!row) {
          return res.status(404).json({ error: 'User not found' });
        }
        if (!row.discordId) {
          return res.status(400).json({ error: 'Discord not connected' });
        }

        const success = await assignDiscordRole(row.discordId, row.currentTier);
        if (success) {
          res.json({ success: true });
        } else {
          res.status(500).json({ error: 'Failed to update Discord roles' });
        }
      }
    );
  } catch (error) {
    console.error('Error updating Discord roles:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


// API: Kiểm tra mã mời
app.post('/api/referrals/validate', async (req, res) => {
  const { referralCode } = req.body;
  if (!referralCode) {
    return res.status(400).json({ success: false, error: 'Referral code is required' });
  }

  try {
    db.get(
      `SELECT 1 FROM users WHERE referralCode = ?`,
      [referralCode],
      (err, row) => {
        if (err) {
          console.error('Error validating referral code:', err);
          return res.status(500).json({ success: false, error: 'Server error' });
        }
        if (row) {
          return res.status(200).json({ success: true, message: 'Referral code is valid' });
        } else {
          return res.status(404).json({ success: false, error: 'Referral code not found' });
        }
      }
    );
  } catch (error) {
    console.error('Error validating referral code:', error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// API: Lấy thông tin user
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

                  // Cập nhật totalPoints và currentTier vào database
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

// API: Lưu điểm vào daily_points
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

// API: Lấy lịch sử điểm (14 ngày)
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

// API: Lấy thông tin referral
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

// API: Lấy referral ranking
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

// API: Cập nhật referrals và điểm
app.post('/api/referrals/update', authenticateJWT, (req, res) => {
  const { publicKey, referralsCount, referralPoints } = req.body;
  if (!publicKey || referralsCount == null || referralPoints == null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (publicKey !== req.user.publicKey) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const newTotalPoints = referralPoints; // Tổng điểm mới từ referral
  const { tier } = calculateTierAndPoints(newTotalPoints);
  const today = new Date();
  const todayStr = formatDate(today);

  db.run(
    `UPDATE users SET
      referralsCount = ?,
      currentTier = ?,
      todayPoints = todayPoints + ?,
      totalPoints = ?
    WHERE publicKey = ?`,
    [referralsCount, tier, referralPoints, newTotalPoints, publicKey],
    (err) => {
      if (err) {
        console.error('Error updating referrals:', err);
        return res.status(500).json({ error: 'Failed to update referrals' });
      }

      db.get(
        `SELECT todayPoints, hoursToday, isNodeConnected, daysSeason1 FROM users WHERE publicKey = ?`,
        [publicKey],
        (err, row) => {
          if (err) {
            console.error('Error fetching todayPoints:', err);
            return;
          }
          db.run(
            `INSERT OR REPLACE INTO daily_points (wallet, date, points) VALUES (?, ?, ?)`,
            [publicKey, todayStr, row.todayPoints],
            (err) => {
              if (err) {
                console.error('Error saving daily points:', err);
                return;
              }

              db.get(
                `SELECT SUM(points) as totalPoints, COUNT(DISTINCT date) as daysSeason1
                 FROM daily_points WHERE wallet = ?`,
                [publicKey],
                (err, sumRow) => {
                  if (err) {
                    console.error('Error fetching totalPoints:', err);
                    return;
                  }
                  const totalPoints = sumRow.totalPoints || 0;
                  const daysSeason1 = sumRow.daysSeason1 || 0;

                  db.run(
                    `UPDATE users SET totalPoints = ?, daysSeason1 = ? WHERE publicKey = ?`,
                    [totalPoints, daysSeason1, publicKey],
                    (err) => {
                      if (err) {
                        console.error('Error updating totalPoints:', err);
                        return;
                      }

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
                          io.to(publicKey).emit('points-update', {
                            totalPoints,
                            todayPoints: row.todayPoints,
                            hoursToday: row.hoursToday || 0,
                            daysSeason1,
                            referralsCount,
                            currentTier: tier,
                            dailyPoints,
                            networkStrength: row.isNodeConnected ? 4 : 0,
                          });
                          io.emit('leaderboard-update', {
                            publicKey,
                            totalPoints,
                          });
                          res.json({ success: true });
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        }
      );
    }
  );
});

// API: Lấy leaderboard
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

// Khởi động server
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});