export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method !== "POST") return new Response("Only POST allowed");

    const pathname = url.pathname;
    const matched = pathname.match(/^\/bot([A-Za-z0-9:_-]+)\/?$/);
    const token = matched?.[1];

    if (!token) return new Response("❌ Bot token missing in path", { status: 400 });

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response("❌ Invalid JSON", { status: 400 });
    }

    const message = update.message || update.edited_message;
    const text = message?.text || "";
    const chatId = message?.chat?.id;

    if (!chatId || !text) return new Response("No message");

    const command = text.split(" ")[0];
    const isReelCommand = text.includes("instagram.com/reel/") || text.includes("instagram.com/p/") || text.startsWith("/reel");

    // Master bot token
    const masterToken = "8139678579:AAEc338z-0Gt45ZPsf35DJSCbaKm8JLvju4";

    // Handle /newbot (only master bot)
    if (command === "/newbot") {
      if (token !== masterToken) {
        await sendMessage(chatId, "❌ Only the master bot can create new bots.", token);
        return new Response("Unauthorized");
      }

      const newToken = text.split(" ")[1];
      if (!newToken || !newToken.startsWith("8")) {
        await sendMessage(chatId, "❌ Invalid or missing bot token.", token);
        return new Response("Invalid token");
      }

      const webhookUrl = `https://${url.hostname}/bot${newToken}`;
      const tgRes = await fetch(`https://api.telegram.org/bot${newToken}/setWebhook?url=${webhookUrl}`);
      const tgJson = await tgRes.json();

      if (tgJson.ok) {
        await sendMessage(chatId, `✅ New bot deployed!\n🎯 Webhook: ${webhookUrl}`, token);
      } else {
        await sendMessage(chatId, `❌ Failed to deploy bot.\nError: ${tgJson.description}`, token);
      }

      return new Response("New bot setup done.");
    }

    // Only handle Instagram reels
    if (!isReelCommand) return new Response("Not a reel or /newbot command");

    let reelUrl = text;
    if (text.startsWith("/reel")) {
      const [, ...rest] = text.split(" ");
      reelUrl = rest.join(" ").trim();
    }

    if (!reelUrl.startsWith("http")) {
      await sendMessage(chatId, "❌ Invalid Instagram URL.", token);
      return new Response("Invalid URL");
    }

    const msg = await sendMessage(chatId, "📥 Downloading Instagram reel...", token);
    const messageId = msg?.result?.message_id;

    try {
      const apiRes = await fetch("https://jerrycoder.oggyapi.workers.dev/insta?url=" + encodeURIComponent(reelUrl));
      const json = await apiRes.json();

      if (!json.status || !json.data || !json.data[0]?.url) {
        if (messageId) await deleteMessage(chatId, messageId, token);
        await sendMessage(chatId, "❌ Failed to fetch the video.", token);
        return new Response("No video found");
      }

      const videoUrl = json.data[0].url;

      if (messageId) await deleteMessage(chatId, messageId, token);
      await sendVideo(chatId, videoUrl, token);

    } catch (e) {
      if (messageId) await deleteMessage(chatId, messageId, token);
      await sendMessage(chatId, "❌ Error downloading the reel.", token);
      console.error("❌ Error:", e);
    }

    return new Response("OK");
  }
};

// Utility functions
async function sendMessage(chatId, text, token) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  return res.json();
}

async function sendVideo(chatId, videoUrl, token) {
  const url = `https://api.telegram.org/bot${token}/sendVideo`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      video: videoUrl,
      caption: "🎬 Here's your Instagram reel!",
    }),
  });
  return res.json();
}

async function deleteMessage(chatId, messageId, token) {
  if (!messageId) return;
  const url = `https://api.telegram.org/bot${token}/deleteMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
  });
}
