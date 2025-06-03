const BOT_MANAGER_TOKEN = '8139678579:AAGyRQMGA0nSZal_14gZ68RGrc6TU8D81TI';
const WORKER_BASE_URL = 'https://oggyhosting.oggyapi-574.workers.dev';
const ADMIN_ID = 7485643534;

const bots = new Set();
const users = new Set();
const userLastCommand = new Map();

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

async function handleStart(chatId, isClone = false, token = BOT_MANAGER_TOKEN) {
  const lastCommand = userLastCommand.get(chatId);
  if (lastCommand === 'start') return;
  userLastCommand.set(chatId, 'start');

  const msg = isClone
    ? `👋 *Welcome!*

Your Telegram bot is active and ready! @HostingPhProbot

Send any Instagram Reel URL to download it instantly. ✅`
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

  await callTelegramAPI('sendMessage', {
    chat_id: chatId,
    text: msg,
    parse_mode: 'Markdown'
  }, token);
}

async function handleHelp(chatId, token = BOT_MANAGER_TOKEN) {
  const lastCommand = userLastCommand.get(chatId);
  if (lastCommand === 'help') return;
  userLastCommand.set(chatId, 'help');

  return callTelegramAPI('sendMessage', {
    chat_id: chatId,
    text: `🤖 *Bot Help*

Send any Instagram reel link to get it downloaded instantly.

Commands:
/start – Show welcome message
/help – Show this help
/id – Get your Telegram ID`,
    parse_mode: 'Markdown'
  }, token);
}

async function handleNewBot(chatId, token) {
  if (!isValidToken(token)) {
    return callTelegramAPI('sendMessage', {
      chat_id: chatId,
      text: '❌ Invalid bot token. Please double-check and try again.'
    });
  }

  const cloningMsg = await callTelegramAPI('sendMessage', {
    chat_id: chatId,
    text: '🔄 Cloning your bot...'
  });
  const cloningMsgData = await cloningMsg.json();

  const webhookURL = `${WORKER_BASE_URL}/api/${token}`;
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
      message_id: cloningMsgData.result.message_id
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
    await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
      method: 'POST'
    });
    return callTelegramAPI('sendMessage', {
      chat_id: chatId,
      text: '✅ Your bot has been deleted.'
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
  const downloading = await callTelegramAPI('sendMessage', {
    chat_id: chatId,
    text: '⏳ Downloading your reel...'
  }, token);
  const messageData = await downloading.json();

  const apiUrl = `https://jerrycoder.oggyapi.workers.dev/insta?url=${encodeURIComponent(url)}`;
  const res = await fetch(apiUrl);
  const data = await res.json();

  if (data.status && data.data && data.data[0]?.url) {
    await callTelegramAPI('deleteMessage', {
      chat_id: chatId,
      message_id: messageData.result.message_id
    }, token);
    return callTelegramAPI('sendVideo', {
      chat_id: chatId,
      video: data.data[0].url,
      caption: '🎬 Here is your Instagram reel!'
    }, token);
  } else {
    return callTelegramAPI('sendMessage', {
      chat_id: chatId,
      text: '❌ Failed to fetch the reel. Please check the URL and try again.'
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
  const res = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const json = await res.json();
  return callTelegramAPI('sendMessage', {
    chat_id: chatId,
    text: '🔍 Webhook Info:\n' + JSON.stringify(json.result, null, 2),
    parse_mode: 'Markdown'
  });
}

async function handleMasterUpdate(update) {
  const message = update.message;
  if (!message || (!message.text && !message.caption)) return;
  const chatId = message.chat.id;
  const text = (message.text || message.caption || '').trim();

  if (text === '/start') return handleStart(chatId);
  if (text === '/help') return handleHelp(chatId);
  if (text === '/stats') return handleStats(chatId);
  if (text === '/id') return callTelegramAPI('sendMessage', {
    chat_id: chatId,
    text: `🆔 Your Telegram ID: \`${chatId}\``,
    parse_mode: 'Markdown'
  });
  if (text.startsWith('/getwebhookinfo')) return handleGetWebhookInfo(chatId, text);
  if (text.startsWith('/deletebot')) return handleDeleteBot(chatId, text);
  if (text.startsWith('/newbot')) {
    const parts = text.split(' ');
    if (parts.length === 2) return handleNewBot(chatId, parts[1]);
  }
  if (text.startsWith('/reel') || isInstagramUrl(text)) {
    const url = text.replace('/reel', '').trim();
    return handleReelCommand(chatId, url);
  }
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const { pathname } = new URL(request.url);
  const token = pathname.split('/').pop();
  const update = await request.json();

  if (token === 'master') {
    await handleMasterUpdate(update);
    return new Response('Master OK');
  }

  if (isValidToken(token)) {
    const message = update.message;
    if (message && message.text === '/start') {
      await handleStart(message.chat.id, true, token);
    } else if (message && (message.text?.startsWith('/reel') || isInstagramUrl(message.text))) {
      const url = message.text.replace('/reel', '').trim();
      await handleReelCommand(message.chat.id, url, token);
    }
    return new Response('Bot OK');
  }

  return new Response('Invalid request');
}
