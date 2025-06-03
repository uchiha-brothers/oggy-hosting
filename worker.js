const BOT_MANAGER_TOKEN = '8139678579:AAEBkjMsnaKUZPUjd2xRTtHgfbMDaJYhku4'; // Master bot token
const MASTER_BOT_USERNAME = '@hostingphprobot'; // For clone message mention
const BASE_API = `https://api.telegram.org/bot${BOT_MANAGER_TOKEN}`;
const WORKER_BASE_URL = 'https://oggyhosting.oggyapi-574.workers.dev'; // Replace this

// Helper to call Telegram API
async function callTelegramAPI(token, method, payload) {
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// Regex for bot token validation
function isValidToken(token) {
  return /^(\d{7,10}):[\w-]{35}$/.test(token);
}

// Send message with parse_mode MarkdownV2 (for better formatting)
async function sendMessage(token, chatId, text, extra = {}) {
  return callTelegramAPI(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'MarkdownV2',
    ...extra,
  });
}

// Master bot commands handlers

async function handleMasterStart(chatId) {
  const msg = `👋 *Welcome to Telegram Bot Hosting!*

• Use /newbot <your-bot-token> to deploy your Instagram downloader bot.

_Example:_
/newbot 123456789:AAExampleTokenHere

Your bot will be live instantly 🚀`;
  await sendMessage(BOT_MANAGER_TOKEN, chatId, msg);
}

async function handleMasterNewBot(chatId, token) {
  if (!isValidToken(token)) {
    return sendMessage(BOT_MANAGER_TOKEN, chatId, '❌ Invalid bot token. Please double-check and try again.');
  }

  const webhookURL = `${WORKER_BASE_URL}/api/${token}`;
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookURL }),
  });
  const json = await res.json();

  if (json.ok) {
    await sendMessage(
      BOT_MANAGER_TOKEN,
      chatId,
      `✅ *Bot deployed successfully!*

🔗 Webhook: \`${webhookURL}\`

⚠️ This bot is cloned by ${MASTER_BOT_USERNAME} and supports Instagram reel/post downloads.`
    );
  } else {
    await sendMessage(BOT_MANAGER_TOKEN, chatId, `❌ Failed to set webhook: ${json.description || 'Unknown error'}`);
  }
}

async function handleMasterHelp(chatId) {
  const helpMsg = `*Master Bot Commands:*

• /start - Welcome message
• /newbot <bot_token> - Clone and deploy new Instagram downloader bot
• /help - Show this help message`;
  await sendMessage(BOT_MANAGER_TOKEN, chatId, helpMsg);
}

async function handleMasterUpdate(update) {
  const message = update.message;
  if (!message || !message.text) return;

  const chatId = message.chat.id;
  const text = message.text.trim();

  if (text === '/start') return handleMasterStart(chatId);
  if (text === '/help') return handleMasterHelp(chatId);

  if (text.startsWith('/newbot')) {
    const parts = text.split(' ');
    if (parts.length === 2) {
      const token = parts[1].trim();
      return handleMasterNewBot(chatId, token);
    } else {
      return sendMessage(BOT_MANAGER_TOKEN, chatId, '❌ Usage: /newbot <your-bot-token>');
    }
  }

  return sendMessage(BOT_MANAGER_TOKEN, chatId, '🤖 Unknown command. Use /help to get list of commands.');
}

// Instagram API call helper
async function getInstagramMedia(url) {
  try {
    const apiUrl = `https://jerrycoder.oggyapi.workers.dev/insta?url=${encodeURIComponent(url)}`;
    const res = await fetch(apiUrl);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status && json.data && json.data.length > 0) {
      return json.data; // array of media info
    }
    return null;
  } catch {
    return null;
  }
}

// Cloned bot handlers

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
        // Send video by URL
        await callTelegramAPI(token, 'sendVideo', {
          chat_id: chatId,
          video: item.url,
          caption: '🎥 Instagram video',
          parse_mode: 'MarkdownV2',
          disable_notification: false,
        });
      } else if (item.type === 'image' || item.type === 'photo') {
        // Send photo by URL
        await callTelegramAPI(token, 'sendPhoto', {
          chat_id: chatId,
          photo: item.url,
          caption: '📷 Instagram photo',
          parse_mode: 'MarkdownV2',
          disable_notification: false,
        });
      } else {
        // fallback: just send the URL as text
        await sendMessage(token, chatId, `🔗 Media link: ${item.url}`, { disable_web_page_preview: true });
      }
    } catch (e) {
      // On error, notify user but continue
      await sendMessage(token, chatId, `❌ Failed to send media: ${e.message}`);
    }
  }
}

async function handleBotUpdate(token, update) {
  const message = update.message;
  if (!message || !message.text) return new Response('ok');

  const chatId = message.chat.id;
  const text = message.text.trim();

  // Commands for cloned bot (NO /newbot here)
  if (text === '/start') return handleBotStart(token, chatId);
  if (text === '/help') return handleBotHelp(token, chatId);

  // Detect Instagram URL (simple check)
  if (
    text.match(/^https?:\/\/(www\.)?instagram\.com\/(reel|p|tv)\/[^\s]+/i)
  ) {
    return handleBotInstagramURL(token, chatId, text);
  }

  // If message starts with slash but not recognized command
  if (text.startsWith('/')) {
    return handleBotUnknown(token, chatId);
  }

  // If normal message but not a URL
  await sendMessage(token, chatId, '❓ Unknown command. Use /help to get help.');
  return new Response('ok');
}

// Main router for Cloudflare Worker
export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      if (url.pathname === '/') {
        // Master bot updates
        const update = await request.json();
        await handleMasterUpdate(update);
        return new Response('OK');
      }

      if (url.pathname.startsWith('/api/')) {
        const token = url.pathname.split('/api/')[1];
        if (!isValidToken(token)) {
          return new Response('Invalid bot token.', { status: 400 });
        }
        // Cloned bot updates
        const update = await request.json();
        return await handleBotUpdate(token, update);
      }

      return new Response('Not Found', { status: 404 });
    } catch (e) {
      return new Response('Error: ' + e.message, { status: 500 });
    }
  },
};
