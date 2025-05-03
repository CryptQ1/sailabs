// discordBot.js

require('dotenv').config();
const { Client, IntentsBitField } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();

const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
  ],
});

const db = new sqlite3.Database('./data.db', (err) => {
  if (err) console.error('Database connection error:', err);
  else console.log('Connected to SQLite database for Discord bot');
});

const TIER_ROLES = {
  'Tier 1': 'DISCORD_TIER1_ROLE_ID',
  'Tier 2': 'DISCORD_TIER2_ROLE_ID',
  'Tier 3': 'DISCORD_TIER3_ROLE_ID',
  'Tier 4': 'DISCORD_TIER4_ROLE_ID',
  'Tier 5': 'DISCORD_TIER5_ROLE_ID',
};

client.on('ready', () => {
  console.log(`Discord bot logged in as ${client.user.tag}`);
});

async function assignRole(discordId, tier) {
  if (!tier || tier === 'None') return;

  const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
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
    // Xóa tất cả vai trò tier hiện tại
    for (const existingRoleId of Object.values(TIER_ROLES)) {
      if (member.roles.cache.has(existingRoleId)) {
        await member.roles.remove(existingRoleId);
        console.log(`Removed role ${existingRoleId} from ${discordId}`);
      }
    }

    // Thêm vai trò mới
    await member.roles.add(roleId);
    console.log(`Assigned role ${role.name} to ${discordId} for tier ${tier}`);
  } catch (err) {
    console.error(`Error assigning role to ${discordId}:`, err);
  }
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  if (command === 'link') {
    const publicKey = args[0];
    if (!publicKey) {
      return message.reply('Vui lòng cung cấp publicKey của ví Solana. Ví dụ: `!link <publicKey>`');
    }

    db.get(
      `SELECT currentTier FROM users WHERE publicKey = ?`,
      [publicKey],
      async (err, row) => {
        if (err) {
          console.error('Error checking publicKey:', err);
          return message.reply('Lỗi server. Vui lòng thử lại sau.');
        }
        if (!row) {
          return message.reply('PublicKey không tồn tại trong hệ thống.');
        }

        const discordId = message.author.id;
        db.run(
          `UPDATE users SET discordId = ? WHERE publicKey = ?`,
          [discordId, publicKey],
          (err) => {
            if (err) {
              console.error('Error saving discordId:', err);
              return message.reply('Lỗi khi liên kết Discord ID. Vui lòng thử lại.');
            }
            message.reply('Liên kết Discord ID thành công!');
            assignRole(discordId, row.currentTier);
          }
        );
      }
    );
  }
});

// Đồng bộ vai trò khi bot khởi động
db.all(`SELECT discordId, currentTier FROM users WHERE discordId IS NOT NULL`, [], (err, rows) => {
  if (err) {
    console.error('Error fetching users for role sync:', err);
    return;
  }
  rows.forEach((row) => {
    assignRole(row.discordId, row.currentTier);
  });
});

client.login(process.env.DISCORD_BOT_TOKEN);