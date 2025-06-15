const MASTER_BOT_TOKEN = "8139678579:AAEc338z-0Gt45ZPsf35DJSCbaKm8JLvju4";
const MASTER_BOT_USERNAME = "hostingphprobot";
const INSTAGRAM_API = "https://jerrycoder.oggyapi.workers.dev/insta?url=";
const MASTER_ADMIN_ID = "7485643534";

const broadcastState = new Map();
const newBotState = new Map();
const deleteBotState = new Map();
const getWebhookState = new Map();

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method !== "POST") return new Response("Only POST allowed");

    const update = await request.json();
    const message = update.message || update.edited_message;
    const text = message?.text || "";
    const chatId = message?.chat?.id;

    if (!chatId || !text) return new Response("No message");

    const botToken = url.searchParams.get("token") || MASTER_BOT_TOKEN;
    const isMaster = botToken === MASTER_BOT_TOKEN;
    const isAdmin = String(chatId) === MASTER_ADMIN_ID;

    // Check if bot is disabled
    if (await env.DISABLED_BOTS_KV.get(botToken)) {
      return new Response("This bot is disabled.");
    }

    // /deletebot (master only)
    if (isMaster && text === "/deletebot") {
  deleteBotState.set(chatId, true);
  await sendMessage(botToken, chatId, "🗑️ Please send the bot token you want to disable or press /cancel to stop.");
  return new Response("Awaiting token to delete");
}

    if (isMaster && text === "/cancel" && deleteBotState.get(chatId)) {
  deleteBotState.delete(chatId);
  await sendMessage(botToken, chatId, "❌ Bot deletion cancelled.");
  return new Response("Cancelled delete flow");
}

if (isMaster && deleteBotState.get(chatId)) {
  if (text.match(/^\d+:[\w-]{30,}$/)) {
    deleteBotState.delete(chatId);
    const tokenToDelete = text.trim();

    if (tokenToDelete === MASTER_BOT_TOKEN) {
      await sendMessage(botToken, chatId, "❌ You cannot disable the master bot.");
      return new Response("Attempt to disable master bot");
    }

    const deployed = await env.DEPLOYED_BOTS_KV.get(tokenToDelete);
    if (!deployed) {
      await sendMessage(botToken, chatId, "❌ Bot token not found or not deployed.");
      return new Response("Unknown token");
    }

    const deleteRes = await fetch(`https://api.telegram.org/bot${tokenToDelete}/deleteWebhook`, {
      method: "POST"
    }).then(r => r.json());

    if (deleteRes.ok) {
      await env.DISABLED_BOTS_KV.put(tokenToDelete, "1");
      await env.DEPLOYED_BOTS_KV.delete(tokenToDelete);
      await sendMessage(botToken, chatId, `🗑️ Bot with token <code>${tokenToDelete}</code> has been disabled and webhook removed.`, "HTML");
    } else {
      await sendMessage(botToken, chatId, `❌ Failed to delete webhook:\n${deleteRes.description}`);
    }

    return new Response("Bot disabled");
  } else {
    await sendMessage(botToken, chatId, "❌ Invalid bot token. Please send a valid token or /cancel.");
    return new Response("Invalid token in delete flow");
  }
}      
   
// Broadcast command handler
if (text === "/broadcast") {
  if ((isMaster && !isAdmin) || (!isMaster && (await env.DEPLOYED_BOTS_KV.get(botToken)) !== `creator:${chatId}`)) {
    await sendMessage(botToken, chatId, "❌ You are not permitted to use /broadcast.");
    return new Response("Unauthorized broadcast");
  }
  broadcastState.set(`${botToken}-${chatId}`, true);
  await sendMessage(botToken, chatId, "📢 Send a *text message* or *photo* now to broadcast.\nSend /cancel to stop.", "Markdown");
  return new Response("Broadcast initiated");
}

// Cancel broadcast
if (text === "/cancel") {
  if (broadcastState.get(`${botToken}-${chatId}`)) {
    broadcastState.delete(`${botToken}-${chatId}`);
    await sendMessage(botToken, chatId, "❌ Broadcast canceled.");
    return new Response("Broadcast canceled");
  }
}
  
if (broadcastState.get(`${botToken}-${chatId}`)) {
  broadcastState.delete(`${botToken}-${chatId}`); // prevent repeat

  await sendMessage(botToken, chatId, "📡 Broadcasting your message...");

  const userKeys = await env.USERS_KV.list({ prefix: `user-${botToken}-` });
  const groupKeys = await env.USERS_KV.list({ prefix: `chat-${botToken}-` });

  const allIds = [
    ...userKeys.keys.map(k => k.name.split("-").pop()),
    ...groupKeys.keys.map(k => k.name.split("-").pop())
  ];

  let sent = 0, failed = 0;

  try {
    const photo = message.photo?.at(-1)?.file_id;
    const caption = message.caption || "";
    const text = message.text;

    for (const id of allIds) {
      try {
        if (photo) {
          await sendPhoto(botToken, id, photo, caption);
        } else if (text) {
          await sendMessage(botToken, id, text);
        } else {
          // nothing to send
          continue;
        }
        sent++;
      } catch (err) {
        console.error(`❌ Failed to send to ${id}:`, err.message || err);
        failed++;
      }
    }

    await sendMessage(botToken, chatId, `✅ Broadcast completed.\n📤 Sent: ${sent}\n❌ Failed: ${failed}`);
    return new Response("Broadcast complete");
  } catch (err) {
    console.error("Broadcast error:", err.message || err);
    await sendMessage(botToken, chatId, `❌ Broadcast failed:\n${err.message || "Unknown error"}`);
    return new Response("Broadcast failed");
  }
}
        
    // /stats (master only)
    if (isMaster && text === "/stats") {
      const listUsers = await env.USERS_KV.list();
      const listBots = await env.DEPLOYED_BOTS_KV.list();
      const listDisabled = await env.DISABLED_BOTS_KV.list();

      const userKeys = listUsers.keys.filter(k => k.name.startsWith(`user-${MASTER_BOT_TOKEN}-`));
      const groupKeys = listUsers.keys.filter(k => k.name.startsWith(`chat-${MASTER_BOT_TOKEN}-`));

      const statsMsg =
        `<b>📊 Global Stats:</b>\n` +
        `• Total unique users: <code>${userKeys.length}</code>\n` +
        `• Total unique groups: <code>${groupKeys.length}</code>\n` +
        `• Total bots deployed: <code>${listBots.keys.length + listDisabled.keys.length}</code>\n` +
        `• Active bots: <code>${listBots.keys.length}</code>\n` +
        `• Disabled bots: <code>${listDisabled.keys.length}</code>`;

      await sendMessage(botToken, chatId, statsMsg, "HTML");
      return new Response("Stats shown");
    }

    // /botlist (admin only)
    if (isMaster && isAdmin && text === "/botlist") {
      const all = await env.DEPLOYED_BOTS_KV.list();
      const grouped = {};

      for (const key of all.keys) {
        const value = await env.DEPLOYED_BOTS_KV.get(key.name);
        if (!value?.startsWith("creator:")) continue;

        const creatorId = value.split(":")[1];
        if (!grouped[creatorId]) grouped[creatorId] = [];

        const botInfo = await fetch(`https://api.telegram.org/bot${key.name}/getMe`).then(r => r.json());
        const username = botInfo.ok ? botInfo.result.username : "(unknown)";
        grouped[creatorId].push({
          username,
          token: key.name
        });
      }

      let output = "<b>🤖 All Deployed Bots:</b>\n\n";

      for (const creator in grouped) {
        const userInfo = await fetch(`https://api.telegram.org/bot${MASTER_BOT_TOKEN}/getChat?chat_id=${creator}`).then(r => r.json());
        const userTag = userInfo.ok ? `@${userInfo.result.username || "(no username)"}` : "(unknown user)";
        output += `${creator} (${userTag}):\n\n`;
        for (const bot of grouped[creator]) {
          output += `• @${bot.username}\n<code>${bot.token}</code>\n\n`;
        }
      }

      await sendMessage(botToken, chatId, output.trim(), "HTML");
      return new Response("Bot list shown");
    }

// Step 1: Start newbot
if (isMaster && text === "/newbot") {
  newBotState.set(chatId, true);
  await sendMessage(botToken, chatId, "🧩 Please send me the bot token from @BotFather or press /cancel to stop.");
  return new Response("Awaiting token");
}

// Cancel newbot flow
if (isMaster && text === "/cancel" && newBotState.get(chatId)) {
  newBotState.delete(chatId);
  await sendMessage(botToken, chatId, "❌ Bot creation cancelled.");
  return new Response("Cancelled");
}

// Step 2: Token received while in newbot flow
if (isMaster && newBotState.get(chatId)) {
  if (text.match(/^\d+:[\w-]{30,}$/)) {
    newBotState.delete(chatId);
    const newToken = text.trim();
    const cloningMsg = await sendMessage(botToken, chatId, "🛠️ Cloning bot...");
    const cloningMsgId = cloningMsg.result?.message_id;

    const webhookUrl = `https://${url.hostname}/?token=${newToken}`;
    const setWebhook = await fetch(`https://api.telegram.org/bot${newToken}/setWebhook?url=${webhookUrl}`).then(r => r.json());

    if (setWebhook.ok) {
      await env.DEPLOYED_BOTS_KV.put(newToken, `creator:${chatId}`);
      await env.DISABLED_BOTS_KV.delete(newToken);

      const botInfo = await fetch(`https://api.telegram.org/bot${newToken}/getMe`).then(r => r.json());
      const newBotUsername = botInfo.ok ? botInfo.result.username : null;

      await fetch(`https://api.telegram.org/bot${newToken}/setMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      commands: [
        { command: "start", description: "Start the bot" },
        { command: "broadcast", description: "Send message to all users" },
        { command: "reel", description: "To download reels" },
        { command: "stats", description: "Show bot stats" },
        { command: "help", description: "How to use the bot" }
      ]
    })
  });
      
      if (cloningMsgId) await deleteMessage(botToken, chatId, cloningMsgId);
      const replyMessage =
        `✅ <b>New bot deployed!</b>\n\n` +
        `All features cloned! Here is bot ${newBotUsername ? `(@${newBotUsername})` : "(username not found)"}\n\n` +
        `🔐 <b>Bot Token:</b>\n<code>${newToken}</code>`;
      await sendMessage(botToken, chatId, replyMessage, "HTML");
    } else {
      if (cloningMsgId) await deleteMessage(botToken, chatId, cloningMsgId);
      await sendMessage(botToken, chatId, `❌ Failed to set webhook.\n${setWebhook.description}`);
    }
    return new Response("Cloning finished");
  } else {
    // Invalid message/token during /newbot flow
    await sendMessage(botToken, chatId, "❌ Invalid bot token. Please send a valid token or /cancel.");
    return new Response("Invalid token format");
  }
}

// /mybots
if (isMaster && text === "/mybots") {
  const allBots = await env.DEPLOYED_BOTS_KV.list();
  const myBots = [];

  for (const entry of allBots.keys) {
    const val = await env.DEPLOYED_BOTS_KV.get(entry.name);
    if (val === `creator:${chatId}`) {
      const botInfo = await fetch(`https://api.telegram.org/bot${entry.name}/getMe`).then(r => r.json());
      const username = botInfo.ok ? botInfo.result.username : "(unknown)";
      myBots.push({ token: entry.name, username });
    }
  }

  if (myBots.length === 0) {
    await sendMessage(botToken, chatId, "🤖 You haven't created any bots yet.");
  } else {
    let msg = `<b>🤖 Your Bots:</b>\n\n`;
    for (const bot of myBots) {
      msg += `• @${bot.username}\n<code>${bot.token}</code>\n\n`;
    }
    await sendMessage(botToken, chatId, msg.trim(), "HTML");
  }

  return new Response("My bots listed");
}

  if (request.method === "GET" && url.pathname === "/list") {
  const all = await env.DEPLOYED_BOTS_KV.list();
  const bots = [];

  for (const key of all.keys) {
    const value = await env.DEPLOYED_BOTS_KV.get(key.name);
    const botInfo = await fetch(`https://api.telegram.org/bot${key.name}/getMe`).then(r => r.json());
    bots.push({
      token: key.name,
      creator: value?.replace("creator:", "") || null,
      username: botInfo.ok ? botInfo.result.username : null
    });
  }

  return new Response(JSON.stringify({ bots }, null, 2), {
    headers: { "Content-Type": "application/json" }
  });
}

    if (text === "/start") {
  const chatType = message.chat.type;
  const keyPrefix = chatType === "private" ? "user" : "chat";
  const key = `${keyPrefix}-${botToken}-${chatId}`;
  const already = await env.USERS_KV.get(key);
  if (!already) await env.USERS_KV.put(key, "1");

  const startMsg = isMaster
    ? `👋🏻 <b>Welcome!</b>\n\n🤖 This bot allows you to download Instagram Reels easily by sending the link.\n\n📥 Just send a <i>reel URL</i> or use the <code>/reel &lt;url&gt;</code> command.\n\n🤖 This bot manages other bots.\nUse <b>buttons below</b> to create or view your bots.\n\n🚀 Powered by <a href="https://t.me/${MASTER_BOT_USERNAME}">@${MASTER_BOT_USERNAME}</a>`
    : `👋🏻 <b>Welcome!</b>\n\n🤖 This bot allows you to download Instagram Reels easily by sending the link.\n\n📥 Just send a <i>reel URL</i> or use the <code>/reel &lt;url&gt;</code> command.`;

  const inlineKeyboard = [
    [
      { text: "➕ New Bot", callback_data: "newbot" },
      { text: "📋 My Bots", callback_data: "mybots" }
    ],
    [
      { text: "📖 Help", callback_data: "help" }
    ]
  ];

  await sendMessage(botToken, chatId, startMsg, "HTML", {
    reply_markup: { inline_keyboard: inlineKeyboard }
  });

  return new Response("Start message sent");
}



const callback = update.callback_query;
if (callback) {
  const data = callback.data;
  const fromId = callback.from.id;
  const msgId = callback.message.message_id;
  const chatId = callback.message.chat.id;

  const backKeyboard = {
    inline_keyboard: [[{ text: "⬅️ Back to Start", callback_data: "start" }]]
  };

  if (data === "help") {
    await editMessage(botToken, chatId, msgId, `📖 <b>Help</b>\n\nJust send an Instagram Reel URL to download it.\n\nCommands:\n/reel - Download a reel\n/broadcast - Send message to all users\n/stats - Show bot stats`, "HTML", backKeyboard);
  }

  if (data === "stats") {
    const listUsers = await env.USERS_KV.list();
    const userKeys = listUsers.keys.filter(k => k.name.startsWith(`user-${botToken}-`));
    const groupKeys = listUsers.keys.filter(k => k.name.startsWith(`chat-${botToken}-`));
    const msg = `<b>📊 Bot Stats</b>\n\n• Users: <code>${userKeys.length}</code>\n• Groups: <code>${groupKeys.length}</code>`;
    await editMessage(botToken, chatId, msgId, msg, "HTML", backKeyboard);
  }

  if (data === "about") {
    await editMessage(botToken, chatId, msgId, `ℹ️ <b>About</b>\n\nThis bot was created to help you download Instagram Reels quickly and manage multiple Telegram bots.`, "HTML", backKeyboard);
  }

  if (data === "start") {
    const startMsg = isMaster
      ? `👋🏻 <b>Welcome Back!</b>\n\nUse the buttons below to manage your bots or download Instagram Reels.`
      : `👋🏻 <b>Welcome!</b>\n\nSend a Reel URL to download.`;

    const inlineKeyboard = [
      [{ text: "📖 Help", callback_data: "help" }],
      [{ text: "📊 Stats", callback_data: "stats" }],
      [{ text: "ℹ️ About", callback_data: "about" }]
    ];

    await editMessage(botToken, chatId, msgId, startMsg, "HTML", {
      inline_keyboard: inlineKeyboard
    });
  }

  return new Response("Callback handled");
}

    // /help
    if (text === "/help") {
      const helpMsg = isMaster
        ? `❓ <b>How to use this bot:</b>\n\n• Send any <i>Instagram reel URL</i>\n• Or use <code>/reel &lt;url&gt;</code>\n• The bot will fetch and send you the video\n\n❓ <b>Master Bot Help:</b>\n\n• /newbot — Deploy new bot\n• /deletebot — Disable Bot Or Delete Bot\n• /stats — Global stats\n• /mybots — Your deployed bots\n\n🔧 For support or updates, visit <a href="https://t.me/oggy24help">@Oggy_Workshop</a>`
        : `❓ <b>How to use this bot:</b>\n\n• Send any <i>Instagram reel URL</i>\n• Or use <code>/reel &lt;url&gt;</code>\n• The bot will fetch and send you the video\n\n🔧 For support or updates, visit <a href="https://t.me/oggy24help">@Oggy_Workshop</a>`;

      await sendMessage(botToken, chatId, helpMsg, "HTML", {
  disable_web_page_preview: true
});
      return new Response("Help shown");
    }

    // /stats (per bot)
    if (text === "/stats") {
      const today = new Date().toISOString().split("T")[0];
      const total = await env.STATS_KV.get(`stats:${botToken}:downloads:total`) || "0";
      const todayCount = await env.STATS_KV.get(`stats:${botToken}:downloads:${today}`) || "0";
      
      const allUserStats = await env.STATS_KV.list({ prefix: `stats:${botToken}:users:` });
      const listUsers = await env.USERS_KV.list({ prefix: `user-${botToken}-` });
const listGroups = await env.USERS_KV.list({ prefix: `chat-${botToken}-` });
const userCount = listUsers.keys.length;
const groupCount = listGroups.keys.length;

      const statsMsg =
        `<b>📊 Bot Stats:</b>\n` +
        `• Total Downloads: <code>${total}</code>\n` +
        `• Downloads Today: <code>${todayCount}</code>\n` +
        `• Unique Users: <code>${userCount}</code>\n` +
        `• Unique Groups: <code>${groupCount}</code>`;

      await sendMessage(botToken, chatId, statsMsg, "HTML");
      return new Response("Per-bot stats shown");
    }

    // Step 1: Start getwebhook flow
if (isMaster && text === "/getwebhook") {
  getWebhookState.set(chatId, true);
  await sendMessage(botToken, chatId, "🔍 Please send the bot token to fetch webhook info, or send /cancel to stop.");
  return new Response("Awaiting token for webhook info");
}

// Cancel getwebhook flow
if (isMaster && text === "/cancel" && getWebhookState.get(chatId)) {
  getWebhookState.delete(chatId);
  await sendMessage(botToken, chatId, "❌ Get webhook info flow cancelled.");
  return new Response("Cancelled webhook info flow");
}

// Step 2: Token received while in getwebhook flow
if (isMaster && getWebhookState.get(chatId)) {
  if (text.match(/^\d+:[\w-]{30,}$/)) {
    getWebhookState.delete(chatId);
    const token = text.trim();

    // Call Telegram getWebhookInfo
    const infoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`).then(r => r.json());

  if (!infoRes.ok) {
    await sendMessage(botToken, chatId, `❌ Failed to get webhook info:\n${infoRes.description}`);
    return new Response("Failed to fetch webhook info");
  }

  const info = infoRes.result;
  const noError = !info.last_error_message && !info.last_error_date;

  const msg =
    `<b>🔗 Webhook Info</b>\n\n` +
    `• URL: <code>${info.url || "None"}</code>\n` +
    `• Has Custom Cert: <code>${info.has_custom_certificate}</code>\n` +
    `• Pending Updates: <code>${info.pending_update_count}</code>\n` +
    `• IP Address: <code>${info.ip_address || "N/A"}</code>\n` +
    `• Max Connections: <code>${info.max_connections || "N/A"}</code>\n` +
    `• Allowed Updates: <code>${(info.allowed_updates || []).join(", ") || "All"}</code>\n\n` +
    (noError ? `✅ No error found` : `⚠️ Last Error:\n<code>${info.last_error_message || "Not found"}</code>\n⏱️ At: <code>${info.last_error_date ? new Date(info.last_error_date * 1000).toISOString() : "Not found"}</code>`);

  await sendMessage(botToken, chatId, msg, "HTML");
  return new Response("Webhook info shown");
} else {
    await sendMessage(botToken, chatId, "❌ Invalid token. Please send a valid bot token or /cancel.");
    return new Response("Invalid token in getwebhook flow");
  }
}

    // /id
    if (text === "/id") {
      await sendMessage(botToken, chatId, `🆔 <b>Your Chat ID:</b> <code>${chatId}</code>`, "HTML");
      return new Response("ID shown");
    }

    // Reel handler
    const isInstaUrl = text.includes("https://") || text.startsWith("/reel");
    if (!isInstaUrl) return new Response("Ignored");

    let reelUrl = text;
    if (text.startsWith("/reel")) {
      reelUrl = text.split(" ").slice(1).join(" ").trim();
    }

    if (!reelUrl.startsWith("http")) {
      await sendMessage(botToken, chatId, "❌ Invalid Instagram URL.");
      return new Response("Invalid URL");
    }

    const statusMsg = await sendMessage(botToken, chatId, "📥 Downloading Instagram reel...");
    const msgId = statusMsg.result?.message_id;

    try {
      const json = await fetch(INSTAGRAM_API + encodeURIComponent(reelUrl)).then(r => r.json());
      const videoUrl = json.data?.[0]?.url;

      if (!videoUrl) {
        await sendMessage(botToken, chatId, "❌ Failed to fetch the video.");
        return new Response("No video");
      }

      await sendVideo(botToken, chatId, videoUrl);

      // 📊 Track per-bot stats
      await trackStats(env, botToken, chatId);
    } catch (err) {
      await sendMessage(botToken, chatId, "❌ Error downloading the reel.");
      console.error(err);
    }

    if (msgId) await deleteMessage(botToken, chatId, msgId);
    return new Response("OK");
   }
};

async function trackStats(env, botToken, chatId) {
  const today = new Date().toISOString().split("T")[0];

  // Increment total downloads
  const totalKey = `stats:${botToken}:downloads:total`;
  const total = parseInt((await env.STATS_KV.get(totalKey)) || "0");
  await env.STATS_KV.put(totalKey, String(total + 1));

  // Increment today’s downloads
  const todayKey = `stats:${botToken}:downloads:${today}`;
  const todayCount = parseInt((await env.STATS_KV.get(todayKey)) || "0");
  await env.STATS_KV.put(todayKey, String(todayCount + 1));

  // Mark user as unique for this bot
  const userKey = `stats:${botToken}:users:${chatId}`;
  await env.STATS_KV.put(userKey, "1");
}

async function editMessage(token, chatId, messageId, text, parseMode = "HTML", replyMarkup = undefined) {
  return await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: parseMode,
      reply_markup: replyMarkup
    })
  });
}

async function sendPhoto(token, chatId, fileId, caption = "") {
  return fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      photo: fileId,
      caption
    })
  }).then(res => res.json());
}

async function sendMessage(botToken, chatId, text, parseMode = "HTML", replyMarkup = null) {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: parseMode,
  };
  if (replyMarkup) {
    payload.reply_markup = replyMarkup;
  }

  return await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(res => res.json());
}

async function sendVideo(botToken, chatId, videoUrl) {
  return await fetch(`https://api.telegram.org/bot${botToken}/sendVideo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      video: videoUrl,
      caption: "🎬 Here's your Instagram reel!"
    })
  }).then(r => r.json());
}

async function deleteMessage(botToken, chatId, messageId) {
  await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
  });
}
