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
      console.log('Session callback:', { session, token });
      session.user.discordId = token.sub;
      session.user.id = token.sub;

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
      console.log('JWT callback:', { token, account });
      if (account?.provider === 'discord') {
        token.sub = account.providerAccountId;
      }
      return token;
    },
    async signIn({ user, account }) {
      console.log('SignIn callback:', { user, account });
      if (account.provider === 'discord') {
        const discordId = user.id;

        try {
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
          return false; // Gây ra lỗi /api/auth/error
        }
      }
      return true;
    },
    async signOut({ token }) {
      console.log('SignOut callback:', { token });
      return true;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60,
  },
  pages: {
    signIn: '/dashboard',
    signOut: '/dashboard',
    error: '/dashboard', // Chuyển hướng lỗi về dashboard
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