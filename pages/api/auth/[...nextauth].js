import NextAuth from 'next-auth';
import DiscordProvider from 'next-auth/providers/discord';
import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('./data.db', (err) => {
  if (err) console.error('Database connection error:', err);
  else console.log('Connected to SQLite database for NextAuth');
});

export default NextAuth({
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      authorization: {
        params: {
          scope: 'identify guilds.members.read',
        },
      },
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      // Lưu Discord user ID vào session
      session.user.discordId = token.sub;
      session.user.id = token.sub; // Giữ lại để tương thích với mã cũ

      // Truy vấn publicKey liên kết với discordId
      try {
        const row = await new Promise((resolve, reject) => {
          db.get(
            `SELECT publicKey FROM users WHERE discordId = ?`,
            [token.sub],
            (err, row) => {
              if (err) reject(err);
              resolve(row);
            }
          );
        });
        session.user.publicKey = row?.publicKey || null;
      } catch (err) {
        console.error('Error fetching publicKey for session:', err);
        session.user.publicKey = null;
      }

      return session;
    },
    async jwt({ token, account }) {
      // Lưu Discord user ID vào token khi đăng nhập
      if (account?.provider === 'discord') {
        token.sub = account.providerAccountId; // Discord user ID
      }
      return token;
    },
    async signIn({ user, account }) {
      console.log('SignIn:', { user, account });
      if (account.provider === 'discord') {
        const discordId = user.id;

        try {
          // Kiểm tra xem discordId đã được liên kết với publicKey chưa
          const existingUser = await new Promise((resolve, reject) => {
            db.get(
              `SELECT publicKey FROM users WHERE discordId = ?`,
              [discordId],
              (err, row) => {
                if (err) reject(err);
                resolve(row);
              }
            );
          });

          if (!existingUser) {
            // Nếu chưa có, tạo bản ghi mới nhưng không lưu access_token/refresh_token
            await new Promise((resolve, reject) => {
              db.run(
                `INSERT OR IGNORE INTO users (discordId) VALUES (?)`,
                [discordId],
                (err) => {
                  if (err) reject(err);
                  resolve();
                }
              );
            });
          } else {
            // Nếu đã có, cập nhật discordId (tránh lưu access_token/refresh_token nếu không cần)
            await new Promise((resolve, reject) => {
              db.run(
                `UPDATE users SET discordId = ? WHERE discordId = ?`,
                [discordId, discordId],
                (err) => {
                  if (err) reject(err);
                  resolve();
                }
              );
            });
          }

          return true;
        } catch (err) {
          console.error('Error during Discord sign-in:', err);
          return false;
        }
      }
      return true;
    },
  },
  secret: process.env.JWT_SECRET,
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // Phiên hết hạn sau 24 giờ, đồng bộ với JWT trong server.js
  },
  pages: {
    signIn: '/dashboard', // Quay lại dashboard sau khi đăng nhập Discord
    signOut: '/dashboard', // Quay lại dashboard sau khi đăng xuất
    error: '/dashboard', // Quay lại dashboard nếu có lỗi
  },
  events: {
    async signIn({ user }) {
      console.log('User signed in:', user);
    },
    async signOut({ session }) {
      console.log('User signed out:', session);
    },
  },
});