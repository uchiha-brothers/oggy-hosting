const BOT_MANAGER_TOKEN = '8139678579:AAFv8G3emG2rQrdq1ivYo1D00kOqfT9wpoo'; // Master bot token
const MASTER_BOT_USERNAME = '@masterbotusername'; // For mention in messages
const WORKER_BASE_URL = 'https://oggyhosting.oggyapi-574.workers.dev'; // Your Worker URL

// Master admin user IDs who can use /bot command (replace with actual Telegram user IDs)
const MASTER_ADMINS = [7485643534]; 

// Store deployed bot tokens and usernames in KV (or in-memory for demo)
const deployedBots = new Map(); // token -> username

// Helper: Call Telegram API
async function callTelegramAPI(token, method, payload) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`Telegram API error (${method}):`, text);
  }
  return res.json();
}

// Validate bot token regex (improved)
function isValidToken(token) {
  return /^\d{7,}:[\w\-]{35,}$/.test(token);
}

// Send message helper with MarkdownV2
async function sendMessage(token, chatId, text, extra = {}) {
  return callTelegramAPI(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'MarkdownV2',
    ...extra,
  });
}

// Fetch bot info (username) using getMe
async function fetchBotUsername(token) {
  const res = await callTelegramAPI(token, 'getMe', {});
  if (res.ok && res.result && res.result.username) {
    return '@' + res.result.username;
  }
  return null;
}

// Master bot handlers

async function handleMasterStart(chatId) {
  const msg = `👋 *Welcome to Telegram Bot Hosting!*

• Use /newbot <your-bot-token> to deploy your Instagram downloader bot.
• Use /bot to see your cloned bots (*admin only*).
• Use /stats to see stats.

_Example:_
/newbot 123456789:AAExampleTokenHere

Your bot will be live instantly 🚀`;
  await sendMessage(BOT_MANAGER_TOKEN, chatId, msg);
}

async function handleMasterHelp(chatId) {
  const msg = `*Master Bot Commands:*

• /start - Welcome message
• /newbot <bot_token> - Clone and deploy new Instagram downloader bot
• /bot - List your cloned bots (*admin only*)
• /stats - Show some bot stats
• /help - Show this help message`;
  await sendMessage(BOT_MANAGER_TOKEN, chatId, msg);
}

async function handleMasterNewBot(chatId, token) {
  if (!isValidToken(token)) {
    return sendMessage(BOT_MANAGER_TOKEN, chatId, '❌ Invalid bot token. Please double-check and try again.');
  }

  // Set webhook for cloned bot
  const webhookURL = `${WORKER_BASE_URL}/api/${token}`;
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookURL }),
  });
  const json = await res.json();

  if (!json.ok) {
    return sendMessage(BOT_MANAGER_TOKEN, chatId, `❌ Failed to set webhook: ${json.description || 'Unknown error'}`);
  }

  // Fetch bot username
  const botUsername = await fetchBotUsername(token);
  if (!botUsername) {
    return sendMessage(BOT_MANAGER_TOKEN, chatId, '❌ Could not fetch cloned bot username.');
  }

  // Save to deployed bots map
  deployedBots.set(token, botUsername);

  await sendMessage(
    BOT_MANAGER_TOKEN,
    chatId,
    `✅ *Bot deployed successfully!*

🔗 Webhook: \`${webhookURL}\`

🤖 Bot username: ${botUsername}

⚠️ This bot is cloned by ${MASTER_BOT_USERNAME} and supports Instagram reel/post downloads.`
  );
}

async function handleMasterBotList(chatId, userId) {
  if (!MASTER_ADMINS.includes(userId)) {
    return sendMessage(BOT_MANAGER_TOKEN, chatId, '❌ You are not authorized to use this command.');
  }

  if (deployedBots.size === 0) {
    return sendMessage(BOT_MANAGER_TOKEN, chatId, 'ℹ️ No cloned bots deployed yet.');
  }

  // List all cloned bots usernames
  let listMsg = '*Cloned Bots:*\n\n';
  let i = 1;
  for (const username of deployedBots.values()) {
    listMsg += `${i++}. ${username}\n`;
  }

  await sendMessage(BOT_MANAGER_TOKEN, chatId, listMsg);
}

async function handleMasterStats(chatId) {
  // Example stats: number of cloned bots
  const count = deployedBots.size;

  const msg = `📊 *Stats:*

• Total cloned bots: ${count}
• Master bot username: ${MASTER_BOT_USERNAME}`;
  await sendMessage(BOT_MANAGER_TOKEN, chatId, msg);
}

async function handleMasterUpdate(update) {
  try {
    const message = update.message;
    if (!message || !message.text) return;

    const chatId = message.chat.id;
    const userId = message.from.id;
    const text = message.text.trim();

    if (text === '/start') return handleMasterStart(chatId);
    if (text === '/help') return handleMasterHelp(chatId);
    if (text === '/stats') return handleMasterStats(chatId);

    if (text.startsWith('/newbot')) {
      const parts = text.split(' ');
      if (parts.length === 2) {
        const token = parts[1].trim();
        return handleMasterNewBot(chatId, token);
      } else {
        return sendMessage(BOT_MANAGER_TOKEN, chatId, '❌ Usage: /newbot <your-bot-token>');
      }
    }

    if (text === '/bot') {
      return handleMasterBotList(chatId, userId);
    }

    return sendMessage(BOT_MANAGER_TOKEN, chatId, '🤖 Unknown command. Use /help to get list of commands.');
  } catch (e) {
    console.error('handleMasterUpdate error:', e);
  }
}

// Instagram API call helper
async function getInstagramMedia(url) {
  try {
    const apiUrl = `https://jerrycoder.oggyapi.workers.dev/insta?url=${encodeURIComponent(url)}`;
    const res = await fetch(apiUrl);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status && json.data && json.data.length > 0) {
      return json.data;
    }
    return null;
  } catch {
    return null;
  }
}

// Cloned bot handlers (unchanged)

async function handleBotStart(token, chatId) {
  const msg = `👋 *Welcome!*

This is your Instagram Reel/Post Downloader Bot, cloned by ${MASTER_BOT_USERNAME}.

• Send me an Instagram reel or post URL, and I will provide you the download link.
• Use /help to get command info.`;
  await sendMessage(token, chatId, msg);
}

async function handleBotHelp(token, chatId) {
  const msg = `*Commands:*

• /start - Welcome message
• /help - Show this help
• Send Instagram reel or post URL to get the download link

_Example:_
https://www.instagram.com/reel/DKFE90PT6Iw/?igsh=OWl2cTY1cWRxb3dx`;
  await sendMessage(token, chatId, msg);
}

async function handleBotUnknown(token, chatId) {
  const msg = '❓ Unknown command. Use /help to get help.';
  await sendMessage(token, chatId, msg);
}

async function handleBotInstagramURL(token, chatId, url) {
  const data = await getInstagramMedia(url);
  if (!data) {
    return sendMessage(token, chatId, '❌ Failed to fetch Instagram media. Please check the URL and try again.');
  }

  for (const item of data) {
    try {
      if (item.type === 'video') {
        await callTelegramAPI(token, 'sendVideo', {
          chat_id: chatId,
          video: item.url,
          caption: '🎥 Instagram video',
          parse_mode: 'MarkdownV2',
          disable_notification: false,
        });
      } else if (item.type === 'image' || item.type === 'photo') {
        await callTelegramAPI(token, 'sendPhoto', {
          chat_id: chatId,
          photo: item.url,
          caption: '📷 Instagram photo',
          parse_mode: 'MarkdownV2',
          disable_notification: false,
        });
      } else {
        await sendMessage(token, chatId, `🔗 Media link: ${item.url}`, { disable_web_page_preview: true });
      }
    } catch (e) {
      await sendMessage(token, chatId, `❌ Failed to send media: ${e.message}`);
    }
  }
}

async function handleBotUpdate(token, update) {
  try {
    const message = update.message;
    if (!message || !message.text) return new Response('ok');

    const chatId = message.chat.id;
    const text = message.text.trim();

    if (text === '/start') return handleBotStart(token, chatId);
    if (text === '/help') return handleBotHelp(token, chatId);

    if (
      text.match(/^https?:\/\/(www\.)?instagram\.com\/(reel|p|tv)\/[^\s]+/i)
    ) {
      return handleBotInstagramURL(token, chatId, text);
    }

    if (text.startsWith('/')) {
      return handleBotUnknown(token, chatId);
    }

    await sendMessage(token, chatId, '❓ Unknown command. Use /help to get help.');
    return new Response('ok');
  } catch (e) {
    console.error('handleBotUpdate error:', e);
    return new Response('ok');
  }
}

// Wrangler-compatible export

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      if (url.pathname === '/') {
        // Master bot webhook
        const update = await request.json();
        await handleMasterUpdate(update);
        return new Response('OK');
      }

      if (url.pathname.startsWith('/api/')) {
        const token = url.pathname.split('/api/')[1];
        if (!isValidToken(token)) {
          return new Response('Invalid bot token.', { status: 400 });
        }
        const update = await request.json();
        await handleBotUpdate(token, update);
        return new Response('OK');
      }

      return new Response('Not Found', { status: 404 });
    } catch (e) {
      console.error('Fetch error:', e);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};
