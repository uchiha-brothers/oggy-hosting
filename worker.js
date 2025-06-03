export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const BOTS_KV = env.BOTS_KV;
    const BOT_MANAGER_TOKEN = env.BOT_MANAGER_TOKEN;
    const WORKER_BASE_URL = env.WORKER_BASE_URL;

    const callTelegramAPI = async (method, payload, token = BOT_MANAGER_TOKEN) => {
      const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.json();
    };

    const isValidToken = (token) => /^(\d{7,10}):[\w-]{35}$/.test(token);

    const isInstagramUrl = (text) =>
      text && text.startsWith('http') && text.includes('instagram.com');

    async function handleStart(chatId) {
      const text = `👋 *Welcome to Telegram Bot Hosting!*

✨ Create and host your own Telegram bots instantly.

• *Deploy:* \`/newbot <your-bot-token>\`
• *Instagram Reel Download:* \`/reel <URL>\`
• *My Bots:* \`/mybots\`

_Example:_
\`\`\`
/newbot 123456789:AAExampleTokenHere
/reel https://www.instagram.com/reel/xyz
\`\`\`

Your bots will go live instantly 🚀`;

      await callTelegramAPI('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      });
    }

    async function handleNewBot(chatId, token, userId) {
      if (!isValidToken(token)) {
        await callTelegramAPI('sendMessage', {
          chat_id: chatId,
          text: '❌ Invalid bot token format. Please double-check and try again.',
        });
        return;
      }

      const webhookURL = `${WORKER_BASE_URL}/api/${token}`;

      // Rate limit delay before setWebhook
      await new Promise((r) => setTimeout(r, 1500));

      let res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookURL }),
      });

      let json = await res.json();

      if (!json.ok && json.description?.includes('Too Many Requests')) {
        // Retry after 2 seconds
        await new Promise((r) => setTimeout(r, 2000));
        res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: webhookURL }),
        });
        json = await res.json();
      }

      if (json.ok) {
        // Successfully set webhook, now get bot info
        const getMeRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
        const botInfo = await getMeRes.json();

        if (!botInfo.ok) {
          await callTelegramAPI('sendMessage', {
            chat_id: chatId,
            text: '❌ Failed to get bot info after webhook setup.',
          });
          return;
        }

        const botUsername = botInfo.result?.username || 'unknown';

        // Save bot info in KV per user - avoid duplicates
        let existing = (await BOTS_KV.get(`bots-${userId}`)) || '[]';
        let list = JSON.parse(existing);

        // Prevent duplicates by token
        if (!list.find((b) => b.token === token)) {
          list.push({ token, username: botUsername });
          await BOTS_KV.put(`bots-${userId}`, JSON.stringify(list));
        }

        await callTelegramAPI('sendMessage', {
          chat_id: chatId,
          text: `✅ *Bot deployed successfully!*\n\n🤖 @${botUsername}\n🔗 Webhook set:\n\`${webhookURL}\``,
          parse_mode: 'Markdown',
        });
      } else if (json.description?.includes('Unauthorized')) {
        await callTelegramAPI('sendMessage', {
          chat_id: chatId,
          text:
            '❌ Failed to set webhook: Unauthorized.\nPlease check if the bot token is correct and belongs to a valid bot.',
        });
      } else {
        await callTelegramAPI('sendMessage', {
          chat_id: chatId,
          text: `❌ Failed to set webhook: ${json.description || 'Unknown error'}`,
        });
      }
    }

    async function handleReelCommand(chatId, url, token = BOT_MANAGER_TOKEN) {
      try {
        const sendingMsg = await callTelegramAPI(
          'sendMessage',
          { chat_id: chatId, text: '⏳ Downloading your reel...' },
          token
        );

        const msgId = sendingMsg.result.message_id;

        const apiUrl = `https://jerrycoder.oggyapi.workers.dev/insta?url=${encodeURIComponent(url)}`;
        const res = await fetch(apiUrl);
        const data = await res.json();

        if (data.status && data.data && data.data[0]?.url) {
          const videoUrl = data.data[0].url;

          await callTelegramAPI(
            'deleteMessage',
            { chat_id: chatId, message_id: msgId },
            token
          );

          return callTelegramAPI(
            'sendVideo',
            { chat_id: chatId, video: videoUrl, caption: '🎬 Here is your Instagram reel!' },
            token
          );
        } else {
          return callTelegramAPI(
            'sendMessage',
            { chat_id: chatId, text: '❌ Failed to fetch the reel. Please check the URL and try again.' },
            token
          );
        }
      } catch (e) {
        return callTelegramAPI(
          'sendMessage',
          { chat_id: chatId, text: `❌ Error while downloading the reel: ${e.message}` },
          token
        );
      }
    }

    async function handleMyBots(chatId, userId) {
      const data = await BOTS_KV.get(`bots-${userId}`);
      if (!data) {
        return callTelegramAPI('sendMessage', {
          chat_id: chatId,
          text: '🙁 You haven’t deployed any bots yet.',
        });
      }

      let bots;
      try {
        bots = JSON.parse(data);
      } catch {
        bots = [];
      }

      if (!bots.length) {
        return callTelegramAPI('sendMessage', {
          chat_id: chatId,
          text: '🙁 You haven’t deployed any bots yet.',
        });
      }

      // Compose one message listing all bots
      const msg =
        `🤖 *Your Deployed Bots:*\n\n` +
        bots.map((b, i) => `*${i + 1}. @${b.username}*`).join('\n');

      return callTelegramAPI('sendMessage', {
        chat_id: chatId,
        text: msg,
        parse_mode: 'Markdown',
      });
    }

    async function handleMasterUpdate(update) {
      const message = update.message;
      if (!message || (!message.text && !message.caption)) return;

      const chatId = message.chat.id;
      const userId = message.from.id;
      const text = (message.text || message.caption || '').trim();

      if (text === '/start') return handleStart(chatId);
      if (text === '/mybots') return handleMyBots(chatId, userId);

      if (text.startsWith('/newbot')) {
        const parts = text.split(' ');
        if (parts.length === 2) {
          const token = parts[1].trim();
          return handleNewBot(chatId, token, userId);
        } else {
          return callTelegramAPI('sendMessage', {
            chat_id: chatId,
            text: '❌ Usage: /newbot <your-bot-token>',
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
            text: '❌ Usage: /reel <Instagram-reel-URL>',
          });
        }
      }

      if (isInstagramUrl(text)) {
        return handleReelCommand(chatId, text);
      }

      return callTelegramAPI('sendMessage', {
        chat_id: chatId,
        text: '🤖 Unknown command. Use /start, /newbot <token>, /reel <url>, or /mybots.',
      });
    }

    async function handleBotWebhook(token, request) {
      try {
        const update = await request.json();
        if (!update.message) return new Response('ok');

        const chatId = update.message.chat.id;
        const text = (update.message.text || update.message.caption || '').trim();

        if (text === '/start') {
          await callTelegramAPI(
            'sendMessage',
            { chat_id: chatId, text: '🤖 Your bot is live and working!' },
            token
          );
          return new Response('ok');
        }

        if (isInstagramUrl(text)) {
          await handleReelCommand(chatId, text, token);
          return new Response('ok');
        }

        return new Response('ok');
      } catch (e) {
        try {
          const update = await request.json();
          const chatId = update?.message?.chat?.id;
          if (chatId) {
            await callTelegramAPI(
              'sendMessage',
              { chat_id: chatId, text: `❌ Error: ${e.message}` },
              token
            );
          }
        } catch {}
        return new Response('error: ' + e.message, { status: 500 });
      }
    }

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
      return handleBotWebhook(token, request);
    }

    return new Response('Not Found', { status: 404 });
  },
};
