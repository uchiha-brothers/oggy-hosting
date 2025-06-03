const MASTER_BOT_TOKEN = "8139678579:AAEc338z-0Gt45ZPsf35DJSCbaKm8JLvju4"; // main bot
const MASTER_BOT_USERNAME = "yourmasterbot"; // without @

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

    // 1. Handle /newbot (only from master bot)
    if (isMaster && text.startsWith("/newbot")) {
      const parts = text.split(" ");
      const newToken = parts[1]?.trim();

      if (!newToken || !newToken.match(/^\d+:[\w-]{30,}$/)) {
        await sendMessage(botToken, chatId, "❌ Invalid bot token.");
        return new Response("Invalid token");
      }

      const webhookUrl = `https://${url.hostname}/?token=${newToken}`;
      const setWebhook = await fetch(
        `https://api.telegram.org/bot${newToken}/setWebhook?url=${webhookUrl}`
      );
      const res = await setWebhook.json();

      if (res.ok) {
        await sendMessage(botToken, chatId, `✅ New bot deployed!\n@${MASTER_BOT_USERNAME} features cloned.\n\nBot Token: \`${newToken}\``);
      } else {
        await sendMessage(botToken, chatId, `❌ Failed to set webhook.\n${res.description}`);
      }

      return new Response("Cloning done");
    }

    // 2. /start command
    if (text === "/start") {
      await sendMessage(botToken, chatId, `👋 Welcome!\nThis bot was created by [@${MASTER_BOT_USERNAME}](https://t.me/${MASTER_BOT_USERNAME})`, "Markdown");
      return new Response("Start handled");
    }

    // 3. Handle Instagram Reels
    const INSTAGRAM_API = "https://jerrycoder.oggyapi.workers.dev/insta?url=";
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

    await sendMessage(botToken, chatId, "📥 Downloading Instagram reel...");

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
