const MASTER_BOT_TOKEN = "8139678579:AAEc338z-0Gt45ZPsf35DJSCbaKm8JLvju4";
const MASTER_BOT_USERNAME = "hostingphprobot";
const INSTAGRAM_API = "https://jerrycoder.oggyapi.workers.dev/insta?url=";

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") return new Response("Only POST allowed");

    const url = new URL(request.url);
    const update = await request.json();
    const message = update.message || update.edited_message;
    const text = message?.text || "";
    const chat = message?.chat;
    const chatId = chat?.id;

    if (!chatId || !text) return new Response("No message");

    const botToken = url.searchParams.get("token") || MASTER_BOT_TOKEN;
    const isMaster = botToken === MASTER_BOT_TOKEN;

    // Track user
    await env.USERS_KV.put(`user-${chatId}`, "1");

    // Block disabled bots
    if (await env.DISABLED_BOTS_KV.get(botToken)) {
      return new Response("This bot is disabled.");
    }

    // --- /botlist (admin-only)
    if (isMaster && text === "/botlist") {
      const deployedBots = await env.DEPLOYED_BOTS_KV.list();
      const usersMap = {};

      for (const entry of deployedBots.keys) {
        const botToken = entry.name;
        const creatorId = (await env.DEPLOYED_BOTS_KV.get(botToken))?.replace("creator:", "");
        if (!creatorId) continue;

        // Fetch creator info once per ID
        if (!usersMap[creatorId]) {
          const userInfo = await fetch(`https://api.telegram.org/bot${MASTER_BOT_TOKEN}/getChat?chat_id=${creatorId}`).then(r => r.json());
          const username = userInfo.ok ? userInfo.result.username : null;
          usersMap[creatorId] = {
            id: creatorId,
            username: username ? `@${username}` : "(no username)",
            bots: []
          };
        }

        const botInfo = await fetch(`https://api.telegram.org/bot${botToken}/getMe`).then(r => r.json());
        const botUsername = botInfo.ok ? `@${botInfo.result.username}` : "(unknown)";
        usersMap[creatorId].bots.push({ username: botUsername, token: botToken });
      }

      const msgParts = Object.values(usersMap).map(user => {
        const botsText = user.bots.map(b => `• ${b.username}\n<code>${b.token}</code>`).join("\n");
        return `<b>${user.id} (${user.username}):</b>\n\n${botsText}`;
      });

      const fullMsg = msgParts.join("\n\n") || "No bots deployed.";
      await sendMessage(botToken, chatId, fullMsg, "HTML");
      return new Response("Botlist shown");
    }

    // --- /start
    if (text === "/start") {
      await sendMessage(botToken, chatId, `👋 <b>Welcome!</b>\n\n🤖 This bot allows you to download Instagram Reels easily by sending the link.\n\n📥 Just send a <i>reel URL</i> or use the <code>/reel &lt;url&gt;</code> command.\n\n🚀 Powered by <a href="https://t.me/${MASTER_BOT_USERNAME}">@${MASTER_BOT_USERNAME}</a>`, "HTML");
      return new Response("Start handled");
    }

    // --- /help
    if (text === "/help") {
      await sendMessage(botToken, chatId, `❓ <b>How to use this bot:</b>\n\n• Send any <i>Instagram reel URL</i>\n• Or use <code>/reel &lt;url&gt;</code>\n• The bot will fetch and send you the video\n\n🔧 For support or updates, visit <a href="https://t.me/${MASTER_BOT_USERNAME}">@${MASTER_BOT_USERNAME}</a>`, "HTML");
      return new Response("Help shown");
    }

    // --- /id
    if (text === "/id") {
      await sendMessage(botToken, chatId, `🆔 <b>Your Chat ID:</b> <code>${chatId}</code>`, "HTML");
      return new Response("ID shown");
    }

    // --- Reel Handler
    const isInstaUrl = text.includes("instagram.com/reel/") || text.startsWith("/reel");
    if (!isInstaUrl) return new Response("Ignored");

    let reelUrl = text.startsWith("/reel") ? text.split(" ").slice(1).join(" ").trim() : text;
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
      } else {
        await sendVideo(botToken, chatId, videoUrl);
      }
    } catch (err) {
      console.error(err);
      await sendMessage(botToken, chatId, "❌ Error downloading the reel.");
    }

    if (msgId) await deleteMessage(botToken, chatId, msgId);
    return new Response("Done");
  }
};

// --- Helpers ---
async function sendMessage(botToken, chatId, text, parse_mode = "HTML") {
  return await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode })
  }).then(r => r.json());
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
  return await fetch(`https://api.telegram.org/bot${botToken}/deleteMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId })
  });
}
