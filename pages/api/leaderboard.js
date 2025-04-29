import sqlite3 from 'sqlite3';
import jwt from 'jsonwebtoken';

const db = new sqlite3.Database('./data.db');

const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Token required' });

  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

export default function handler(req, res) {
  authenticateJWT(req, res, async () => {
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
}