const BOT_MANAGER_TOKEN = '8139678579:AAFv8G3emG2rQrdq1ivYo1D00kOqfT9wpoo';
const BASE_API = `https://api.telegram.org/bot${BOT_MANAGER_TOKEN}`;
const WORKER_BASE_URL = 'https://oggyhosting.oggyapi-574.workers.dev';

async function callTelegramAPI(method, payload, token = BOT_MANAGER_TOKEN) {
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

function isValidToken(token) {
  return /^(\d{7,10}):[\w-]{35}$/.test(token);
}

function isInstagramUrl(text) {
  return text && text.includes('instagram.com') && text.startsWith('http');
}

async function handleStart(chatId) {
  const msg = `👋 *Welcome to Telegram Bot Hosting!*

• Use /newbot <your-bot-token> to deploy your bot.
• Use /reel <Instagram-URL> to download reels.

_Example:_
/newbot 123456789:AAExampleTokenHere
/reel https://www.instagram.com/reel/xxxx

Your bot will be live instantly 🚀`;

  await callTelegramAPI('sendMessage', {
    chat_id: chatId,
    text: msg,
    parse_mode: 'Markdown'
  });
}

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

async function handleReelCommand(chatId, url, token = BOT_MANAGER_TOKEN) {
  try {
    const downloadingMsg = await callTelegramAPI('sendMessage', {
      chat_id: chatId,
      text: '⏳ Downloading your reel...',
    }, token);
    const messageData = await downloadingMsg.json();

    const apiUrl = `https://jerrycoder.oggyapi.workers.dev/insta?url=${encodeURIComponent(url)}`;
    const res = await fetch(apiUrl);
    const data = await res.json();

    if (data.status && data.data && data.data[0]?.url) {
      const videoUrl = data.data[0].url;

      // Delete the "downloading..." message
      await callTelegramAPI('deleteMessage', {
        chat_id: chatId,
        message_id: messageData.result.message_id
      }, token);

      return callTelegramAPI('sendVideo', {
        chat_id: chatId,
        video: videoUrl,
        caption: '🎬 Here is your Instagram reel!',
      }, token);
    } else {
      return callTelegramAPI('sendMessage', {
        chat_id: chatId,
        text: '❌ Failed to fetch the reel. Please check the URL and try again.'
      }, token);
    }
  } catch (e) {
    return callTelegramAPI('sendMessage', {
      chat_id: chatId,
      text: `❌ Error while downloading the reel: ${e.message}`
    }, token);
  }
}

async function handleMasterUpdate(update) {
  const message = update.message;
  if (!message || (!message.text && !message.caption)) return;

  const chatId = message.chat.id;
  const text = (message.text || message.caption || '').trim();

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

  if (text.startsWith('/reel')) {
    const parts = text.split(' ');
    if (parts.length === 2) {
      const url = parts[1].trim();
      return handleReelCommand(chatId, url);
    } else {
      return callTelegramAPI('sendMessage', {
        chat_id: chatId,
        text: '❌ Usage: /reel <Instagram-reel-URL>'
      });
    }
  }

  if (isInstagramUrl(text)) {
    return handleReelCommand(chatId, text);
  }

  return callTelegramAPI('sendMessage', {
    chat_id: chatId,
    text: '🤖 Unknown command. Use /start, /newbot <token> or /reel <url>'
  });
}

async function handleBotWebhook(token, request) {
  try {
    const update = await request.json();
    if (!update.message) return new Response('ok');

    const chatId = update.message.chat.id;
    const text = (update.message.text || update.message.caption || '').trim();

    if (text === '/start') {
      await callTelegramAPI('sendMessage', {
        chat_id: chatId,
        text: '🤖 Your bot is live and working!'
      }, token);
      return new Response('ok');
    }

    if (isInstagramUrl(text)) {
      await handleReelCommand(chatId, text, token);
      return new Response('ok');
    }

    // Do nothing on regular messages
    return new Response('ok');
  } catch (e) {
    const update = await request.json();
    const chatId = update?.message?.chat?.id;
    if (chatId) {
      await callTelegramAPI('sendMessage', {
        chat_id: chatId,
        text: `❌ Error: ${e.message}`
      }, token);
    }
    return new Response('error: ' + e.message, { status: 500 });
  }
}

// Main router
export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    try {
      if (url.pathname === '/') {
        const update = await request.json();
        await handleMasterUpdate(update);
        return new Response('OK');
      }

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
