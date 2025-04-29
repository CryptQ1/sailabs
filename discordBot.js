const { Client, IntentsBitField } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();

const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
  ],
});

const db = new sqlite3.Database('./data.db');

client.once('ready', () => {
  console.log(`Discord Bot logged in as ${client.user.tag}`);
});

// Hàm đồng bộ vai trò
const syncDiscordRole = async (publicKey, currentTier) => {
  try {
    db.get(
      `SELECT discordId FROM users WHERE publicKey = ?`,
      [publicKey],
      async (err, row) => {
        if (err) {
          console.error('Error fetching discordId:', err);
          return;
        }
        if (!row || !row.discordId) return;

        const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
        const member = await guild.members.fetch(row.discordId);
        if (!member) return;

        // Ánh xạ tier với Role ID
        const roleMap = {
          'Tier 1': '1366251783894073354',
          'Tier 2': '1366251936311152680',
          'Tier 3': '1366251981911494798',
          'Tier 4': '1366252018028777602',
          'Tier 5': '1366252051360649267',
        };

        // Xóa tất cả vai trò tier cũ
        const tierRoles = Object.values(roleMap);
        await member.roles.remove(tierRoles.filter((roleId) => member.roles.cache.has(roleId)));

        // Thêm vai trò mới tương ứng với currentTier
        const newRoleId = roleMap[currentTier];
        if (newRoleId && currentTier !== 'None') {
          await member.roles.add(newRoleId);
          console.log(`Assigned ${currentTier} role to ${member.user.tag}`);
        }
      }
    );
  } catch (error) {
    console.error('Error syncing Discord role:', error);
  }
};

// Khởi động bot
client.login(process.env.DISCORD_BOT_TOKEN);

// Xuất hàm syncDiscordRole để sử dụng trong server.js
module.exports = { syncDiscordRole };