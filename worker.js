const MASTER_BOT_TOKEN = "8139678579:AAEc338z-0Gt45ZPsf35DJSCbaKm8JLvju4";
const MASTER_BOT_USERNAME = "hostingphprobot"; // without @
const INSTAGRAM_API = "https://jerrycoder.oggyapi.workers.dev/insta?url=";

// In-memory store (reset on worker restart)
const disabledBots = new Set();
const deployedBots = new Set([MASTER_BOT_TOKEN]); // start with master bot
const users = new Set();

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

    // Check if bot is disabled
    if (disabledBots.has(botToken)) {
      // Bot disabled, ignore all commands
      return new Response("This bot is disabled.");
    }

    // Track unique users (all bots)
    users.add(chatId);

    // Note: We only add to deployedBots when new bot is deployed (see /newbot handler below)
    // Because bots might not send messages to this worker otherwise.

    // Handle /deletebot command (only from master)
    if (isMaster && text.startsWith("/deletebot")) {
      const parts = text.split(" ");
      const tokenToDelete = parts[1]?.trim();

      if (!tokenToDelete) {
        await sendMessage(botToken, chatId, "❌ Please provide a bot token to delete.");
        return new Response("No token to delete");
      }
      if (tokenToDelete === MASTER_BOT_TOKEN) {
        await sendMessage(botToken, chatId, "❌ You cannot disable the master bot.");
        return new Response("Attempt to disable master bot");
      }

      if (!deployedBots.has(tokenToDelete)) {
        await sendMessage(botToken, chatId, "❌ Bot token not found or not deployed.");
        return new Response("Unknown token");
      }

      // Delete webhook to disable bot
      const deleteWebhookUrl = `https://api.telegram.org/bot${tokenToDelete}/deleteWebhook`;
      const deleteResRaw = await fetch(deleteWebhookUrl, { method: "POST" });
      const deleteRes = await deleteResRaw.json();

      if (deleteRes.ok) {
        disabledBots.add(tokenToDelete);
        deployedBots.delete(tokenToDelete); // remove from deployedBots since disabled
        await sendMessage(botToken, chatId, `🗑️ Bot with token <code>${tokenToDelete}</code> has been disabled and webhook removed.`, "HTML");
      } else {
        await sendMessage(botToken, chatId, `❌ Failed to delete webhook:\n${deleteRes.description}`);
      }

      return new Response("Bot disabled");
    }

    // Handle /stats command (only master can see)
    if (isMaster && text === "/stats") {
      const activeBotsCount = deployedBots.size;
      const disabledBotsCount = disabledBots.size;
      const totalBots = activeBotsCount + disabledBotsCount;
      const usersCount = users.size;

      const statsMsg = 
        `<b>📊 Stats:</b>\n` +
        `• Total unique users: <code>${usersCount}</code>\n` +
        `• Total bots deployed: <code>${totalBots}</code>\n` +
        `• Active bots: <code>${activeBotsCount}</code>\n` +
        `• Disabled bots: <code>${disabledBotsCount}</code>`;

      await sendMessage(botToken, chatId, statsMsg, "HTML");
      return new Response("Stats shown");
    }

    // Handle /newbot from master
    if (isMaster && text.startsWith("/newbot")) {
      const parts = text.split(" ");
      const newToken = parts[1]?.trim();

      if (!newToken || !newToken.match(/^\d+:[\w-]{30,}$/)) {
        await sendMessage(botToken, chatId, "❌ Invalid bot token.");
        return new Response("Invalid token");
      }

      const webhookUrl = `https://${url.hostname}/?token=${newToken}`;
      const setWebhookRaw = await fetch(
        `https://api.telegram.org/bot${newToken}/setWebhook?url=${webhookUrl}`
      );
      const setWebhook = await setWebhookRaw.json();

      if (setWebhook.ok) {
        // Add to deployed bots on successful deploy
        deployedBots.add(newToken);
        // If the bot was disabled previously, remove from disabledBots (re-enable)
        disabledBots.delete(newToken);

        await sendMessage(botToken, chatId, `✅ New bot deployed!\n\nAll features cloned from [@${MASTER_BOT_USERNAME}](https://t.me/${MASTER_BOT_USERNAME})\n\n🔐 Bot Token:\n<code>${newToken}</code>`, "HTML");
      } else {
        await sendMessage(botToken, chatId, `❌ Failed to set webhook.\n${setWebhook.description}`);
      }

      return new Response("Cloning done");
    }

    // /start command
    if (text === "/start") {
      await sendMessage(botToken, chatId, `👋 <b>Welcome!</b>\n\n🤖 This bot allows you to download Instagram Reels easily by sending the link.\n\n📥 Just send a <i>reel URL</i> or use the <code>/reel &lt;url&gt;</code> command.\n\n🚀 Powered by <a href="https://t.me/${MASTER_BOT_USERNAME}">@${MASTER_BOT_USERNAME}</a>`, "HTML");
      return new Response("Start handled");
    }

    // /help command
    if (text === "/help") {
      await sendMessage(botToken, chatId, `❓ <b>How to use this bot:</b>\n\n• Send any <i>Instagram reel URL</i>\n• Or use <code>/reel &lt;url&gt;</code>\n• The bot will fetch and send you the video\n\n🔧 For support or updates, visit <a href="https://t.me/${MASTER_BOT_USERNAME}">@${MASTER_BOT_USERNAME}</a>`, "HTML");
      return new Response("Help shown");
    }

    // /id command
    if (text === "/id") {
      await sendMessage(botToken, chatId, `🆔 <b>Your Chat ID:</b> <code>${chatId}</code>`, "HTML");
      return new Response("ID shown");
    }

    // Instagram reel handling
    const isInstaUrl = text.includes("instagram.com/reel/") || text.startsWith("/reel");
    if (!isInstaUrl) return new Response("Ignored non-Instagram message");

    let reelUrl = text;
    if (text.startsWith("/reel")) {
      const [, ...rest] = text.split(" ");
      reelUrl = rest.join(" ").trim();
    }

    if (!reelUrl.startsWith("http")) {
      await sendMessage(botToken, chatId, "❌ Invalid Instagram URL.");
      return new Response("Invalid URL");
    }

    const statusMsg = await sendMessage(botToken, chatId, "📥 Downloading Instagram reel...");
    const msgId = statusMsg.result?.message_id;

    try {
      const apiRes = await fetch(INSTAGRAM_API + encodeURIComponent(reelUrl));
      const json = await apiRes.json();

      if (!json.status || !json.data || !json.data[0]?.url) {
        await sendMessage(botToken, chatId, "❌ Failed to fetch the video.");
        return new Response("No video found");
      }

      const videoUrl = json.data[0].url;
      await sendVideo(botToken, chatId, videoUrl);

    } catch (e) {
      await sendMessage(botToken, chatId, "❌ Error downloading the reel.");
      console.error(e);
    }

    // Delete "Downloading..." message
    if (msgId) await deleteMessage(botToken, chatId, msgId);

    return new Response("OK");
  }
};

async function sendMessage(botToken, chatId, text, parse_mode = "HTML") {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode }),
  });
  return res.json();
}

async function sendVideo(botToken, chatId, videoUrl) {
  const url = `https://api.telegram.org/bot${botToken}/sendVideo`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      video: videoUrl,
      caption: "🎬 Here's your Instagram reel!"
    }),
  });
  return res.json();
}

async function deleteMessage(botToken, chatId, messageId) {
  const url = `https://api.telegram.org/bot${botToken}/deleteMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
  });
}
