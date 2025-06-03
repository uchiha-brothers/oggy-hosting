const BOT_MANAGER_TOKEN = '8139678579:AAEBkjMsnaKUZPUjd2xRTtHgfbMDaJYhku4'; // 🔁 Replace this
const BASE_API = `https://api.telegram.org/bot${BOT_MANAGER_TOKEN}`;
const WORKER_BASE_URL = 'https://your-worker-subdomain.workers.dev'; // 🔁 Replace this

// Basic helper to talk to Telegram
async function callTelegramAPI(method, payload) {
  return fetch(`${BASE_API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

// Regex to validate Telegram bot tokens
function isValidToken(token) {
  return /^(\d{7,10}):[\w-]{35}$/.test(token);
}

// /start command for master bot
async function handleStart(chatId) {
  const msg = `👋 *Welcome to Telegram Bot Hosting!*

• Use /newbot <your-bot-token> to deploy your bot.

_Example:_
/newbot 123456789:AAExampleTokenHere

Your bot will be live instantly 🚀`;

  await callTelegramAPI('sendMessage', {
    chat_id: chatId,
    text: msg,
    parse_mode: 'Markdown'
  });
}

// /newbot command
async function handleNewBot(chatId, token) {
  if (!isValidToken(token)) {
    return callTelegramAPI('sendMessage', {
      chat_id: chatId,
      text: '❌ Invalid bot token. Please double-check and try again.'
    });
  }

  const webhookURL = `${WORKER_BASE_URL}/api/${token}`;
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookURL })
  });
  const json = await res.json();

  if (json.ok) {
    await callTelegramAPI('sendMessage', {
      chat_id: chatId,
      text: `✅ Bot deployed successfully!\n\n🔗 Webhook: \`${webhookURL}\``,
      parse_mode: 'Markdown'
    });
  } else {
    await callTelegramAPI('sendMessage', {
      chat_id: chatId,
      text: `❌ Failed to set webhook: ${json.description || 'Unknown error'}`
    });
  }
}

// Main message handler for master bot
async function handleMasterUpdate(update) {
  const message = update.message;
  if (!message || !message.text) return;

  const chatId = message.chat.id;
  const text = message.text.trim();

  if (text === '/start') return handleStart(chatId);

  if (text.startsWith('/newbot')) {
    const parts = text.split(' ');
    if (parts.length === 2) {
      const token = parts[1].trim();
      return handleNewBot(chatId, token);
    } else {
      return callTelegramAPI('sendMessage', {
        chat_id: chatId,
        text: '❌ Usage: /newbot <your-bot-token>'
      });
    }
  }

  return callTelegramAPI('sendMessage', {
    chat_id: chatId,
    text: '🤖 Unknown command. Use /start or /newbot <token>'
  });
}

// Handler for individual deployed bots
async function handleBotWebhook(token, request) {
  const update = await request.json();
  if (!update.message) return new Response('ok');

  const chatId = update.message.chat.id;
  const text = update.message.text || '';

  const reply = text === '/start'
    ? '🤖 Your bot is live and working!'
    : '✅ Message received by your bot.';

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: reply })
  });

  return new Response('ok');
}

// Main router
export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      // Master bot: /
      if (url.pathname === '/') {
        const update = await request.json();
        await handleMasterUpdate(update);
        return new Response('OK');
      }

      // Deployed bots: /api/<token>
      if (url.pathname.startsWith('/api/')) {
        const token = url.pathname.split('/api/')[1];
        if (!isValidToken(token)) {
          return new Response('Invalid bot token.', { status: 400 });
        }
        return await handleBotWebhook(token, request);
      }

      return new Response('Not Found', { status: 404 });
    } catch (e) {
      return new Response('Error: ' + e.message, { status: 500 });
    }
  }
};
