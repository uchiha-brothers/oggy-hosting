const BOT_MANAGER_TOKEN = '8139678579:AAGyRQMGA0nSZal_14gZ68RGrc6TU8D81TI';
const WORKER_BASE_URL = 'https://oggyhosting.oggyapi-574.workers.dev';
const ADMIN_ID = 7485643534;

const bots = new Set();
const users = new Set();
const sentMessages = new Map(); // used by sendOnce()

function isValidToken(token) {
  return /^\d{7,10}:[\w-]{35}$/.test(token);
}

function isInstagramUrl(text) {
  return text && text.includes('instagram.com') && text.startsWith('http');
}

async function callTelegramAPI(method, payload, token = BOT_MANAGER_TOKEN) {
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

async function sendOnce(chatId, type, content, token = BOT_MANAGER_TOKEN) {
  const key = `${chatId}:${type}:${token}`;
  if (sentMessages.has(key)) return;
  sentMessages.set(key, true);
  await callTelegramAPI('sendMessage', {
    chat_id: chatId,
    text: content,
    parse_mode: 'Markdown'
  }, token);
}

async function handleStart(chatId, isClone = false, token = BOT_MANAGER_TOKEN) {
  const msg = isClone
    ? `👋 *Welcome!*\n\nYour Telegram bot is active and ready! @HostingPhProbot\n\nSend any Instagram Reel URL to download it instantly. ✅`
    : `👋 *Welcome to Telegram Bot Hosting!*

• *Deploy your own bot:* \`/newbot <your-bot-token>\`
• *Download Instagram reels:* \`/reel <Instagram-URL>\`
• *Delete a bot:* \`/deletebot <bot-token>\`
• *Stats:* \`/stats\`
• *Your ID:* \`/id\`
• *Webhook Info:* \`/getwebhookinfo <bot-token>\`

_Example:_
/newbot 123456789:AAExampleTokenHere
/reel https://www.instagram.com/reel/xxxx

Your bot will be live instantly 🚀`;

  await sendOnce(chatId, 'start', msg, token);
}

async function handleHelp(chatId, token) {
  return sendOnce(chatId, 'help', `🤖 *Bot Help*

Send any Instagram reel link to get it downloaded instantly.

Commands:
/start – Show welcome message
/help – Show this help
/id – Get your Telegram ID`, token);
}

async function handleNewBot(chatId, token) {
  if (!isValidToken(token)) {
    return callTelegramAPI('sendMessage', {
      chat_id: chatId,
      text: '❌ Invalid bot token. Please double-check and try again.'
    });
  }

  const webhookURL = `${WORKER_BASE_URL}/api/${token}`;
  const cloningMsg = await callTelegramAPI('sendMessage', {
    chat_id: chatId,
    text: '🔄 Cloning your bot...'
  });
  const msgData = await cloningMsg.json();

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookURL })
  });

  const json = await res.json();

  if (json.ok) {
    bots.add(token);
    users.add(chatId);
    await callTelegramAPI('deleteMessage', {
      chat_id: chatId,
      message_id: msgData.result.message_id
    });
    return callTelegramAPI('sendMessage', {
      chat_id: chatId,
      text: `✅ Bot deployed successfully!\n\n🔗 Webhook: \`${webhookURL}\``,
      parse_mode: 'Markdown'
    });
  } else {
    return callTelegramAPI('sendMessage', {
      chat_id: chatId,
      text: `❌ Failed to set webhook: ${json.description || 'Unknown error'}`
    });
  }
}

async function handleDeleteBot(chatId, text) {
  const parts = text.split(' ');
  if (parts.length !== 2) {
    return callTelegramAPI('sendMessage', {
      chat_id: chatId,
      text: '❌ Please provide a bot token.\n\nUsage: /deletebot <bot-token>'
    });
  }
  const token = parts[1];
  if (bots.has(token)) {
    bots.delete(token);
    await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`);
    return callTelegramAPI('sendMessage', {
      chat_id: chatId,
      text: '✅ Your bot has been deleted from memory and webhook.'
    });
  } else {
    return callTelegramAPI('sendMessage', {
      chat_id: chatId,
      text: '⚠️ Bot token not found or already deleted.'
    });
  }
}

async function handleStats(chatId) {
  return callTelegramAPI('sendMessage', {
    chat_id: chatId,
    text: `📊 *Bot Stats:*

• Total Bots: *${bots.size}*
• Total Users: *${users.size}*

⚠️ *Note:* Data is stored in-memory and will reset on worker restarts.`,
    parse_mode: 'Markdown'
  });
}

async function handleReelCommand(chatId, url, token = BOT_MANAGER_TOKEN) {
  try {
    const downloading = await callTelegramAPI('sendMessage', {
      chat_id: chatId,
      text: '⏳ Downloading your reel...'
    }, token);
    const messageData = await downloading.json();

    const apiUrl = `https://jerrycoder.oggyapi.workers.dev/insta?url=${encodeURIComponent(url)}`;
    const res = await fetch(apiUrl);
    const data = await res.json();

    if (data.status && data.data && data.data[0]?.url) {
      const videoUrl = data.data[0].url;
      await callTelegramAPI('deleteMessage', {
        chat_id: chatId,
        message_id: messageData.result.message_id
      }, token);
      return callTelegramAPI('sendVideo', {
        chat_id: chatId,
        video: videoUrl,
        caption: '🎬 Here is your Instagram reel!'
      }, token);
    } else {
      return callTelegramAPI('sendMessage', {
        chat_id: chatId,
        text: '❌ Failed to fetch the reel. Please check the URL and try again.'
      }, token);
    }
  } catch (e) {
    await callTelegramAPI('sendMessage', {
      chat_id: ADMIN_ID,
      text: `❌ Error in /reel handler:\n${e.message}`
    });
    return callTelegramAPI('sendMessage', {
      chat_id: chatId,
      text: `❌ Error while downloading the reel: ${e.message}`
    }, token);
  }
}

async function handleGetWebhookInfo(chatId, text) {
  const parts = text.split(' ');
  if (parts.length !== 2) {
    return callTelegramAPI('sendMessage', {
      chat_id: chatId,
      text: '❌ Usage: /getwebhookinfo <bot-token>'
    });
  }
  const token = parts[1];
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const json = await res.json();
    return callTelegramAPI('sendMessage', {
      chat_id: chatId,
      text: '🔍 Webhook Info:\n' + JSON.stringify(json.result, null, 2),
      parse_mode: 'Markdown'
    });
  } catch (e) {
    return callTelegramAPI('sendMessage', {
      chat_id: chatId,
      text: `❌ Error fetching webhook info: ${e.message}`
    });
  }
}

async function handleMasterUpdate(update) {
  try {
    const message = update.message;
    if (!message || (!message.text && !message.caption)) return;
    const chatId = message.chat.id;
    const text = (message.text || message.caption || '').trim();

    if (text === '/start') return handleStart(chatId, false);
    if (text === '/stats') return handleStats(chatId);
    if (text === '/id') return callTelegramAPI('sendMessage', {
      chat_id: chatId,
      text: `🆔 Your Telegram ID: \`${chatId}\``,
      parse_mode: 'Markdown'
    });
    if (text.startsWith('/getwebhookinfo')) return handleGetWebhookInfo(chatId, text);
    if (text.startsWith('/newbot')) {
      const parts = text.split(' ');
      if (parts.length === 2) return handleNewBot(chatId, parts[1].trim());
      return callTelegramAPI('sendMessage', {
        chat_id: chatId,
        text: '❌ Usage: /newbot <your-bot-token>'
      });
    }
    if (text.startsWith('/deletebot')) return handleDeleteBot(chatId, text);
    if (text.startsWith('/reel')) {
      const parts = text.split(' ');
      if (parts.length === 2) return handleReelCommand(chatId, parts[1].trim());
      return callTelegramAPI('sendMessage', {
        chat_id: chatId,
        text: '❌ Usage: /reel <Instagram-reel-URL>'
      });
    }
    if (isInstagramUrl(text)) return handleReelCommand(chatId, text);
    return callTelegramAPI('sendMessage', {
      chat_id: chatId,
      text: '🤖 Unknown command. Use /start, /newbot <token>, /reel <url>, /deletebot <token>, /stats, /id, or /getwebhookinfo <token>.'
    });
  } catch (e) {
    await callTelegramAPI('sendMessage', {
      chat_id: ADMIN_ID,
      text: `❌ Master handler error:\n${e.stack || e.message}`
    });
  }
}

async function handleBotWebhook(token, request) {
  try {
    const update = await request.json();
    if (!update.message) return new Response('ok');
    const chatId = update.message.chat.id;
    const text = (update.message.text || update.message.caption || '').trim();

    if (text === '/start') return handleStart(chatId, true, token);
    if (text === '/id') return callTelegramAPI('sendMessage', {
      chat_id: chatId,
      text: `🆔 Your Telegram ID: \`${chatId}\``,
      parse_mode: 'Markdown'
    }, token);
    if (text === '/help') return handleHelp(chatId, token);
    if (isInstagramUrl(text)) return handleReelCommand(chatId, text, token);

    return new Response('ok');
  } catch (e) {
    await callTelegramAPI('sendMessage', {
      chat_id: ADMIN_ID,
      text: `❌ Bot handler error:\n${e.stack || e.message}`
    });
    return new Response('error: ' + e.message, { status: 500 });
  }
}

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
      await callTelegramAPI('sendMessage', {
        chat_id: ADMIN_ID,
        text: `❌ Global error:\n${e.stack || e.message}`
      });
      return new Response('Error: ' + e.message, { status: 500 });
    }
  }
};
