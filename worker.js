export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method !== "POST") return new Response("Only POST allowed");

    const update = await request.json();
    const message = update.message || update.edited_message;
    const text = message?.text || "";
    const chatId = message?.chat?.id;

    if (!chatId || !text) return new Response("No message");

    const command = text.split(" ")[0];
    const isReelCommand = text.includes("instagram.com/reel/") || text.startsWith("/reel");

    // Handle /newbot
    if (command === "/newbot") {
      const newToken = text.split(" ")[1];
      if (!newToken || !newToken.startsWith("8")) {
        await sendMessage(chatId, "❌ Invalid or missing bot token.");
        return new Response("Invalid token");
      }

      const webhookUrl = "https://" + url.hostname;
      const tgUrl = `https://api.telegram.org/bot${newToken}/setWebhook?url=${webhookUrl}`;
      const tgRes = await fetch(tgUrl);
      const tgJson = await tgRes.json();

      if (tgJson.ok) {
        await sendMessage(chatId, `✅ New bot deployed!\n🎯 Webhook: ${webhookUrl}`);
      } else {
        await sendMessage(chatId, `❌ Failed to deploy bot.\nError: ${tgJson.description}`);
      }

      return new Response("New bot setup done.");
    }

    // Handle Instagram Reel
    if (!isReelCommand) return new Response("Not a reel or newbot command");

    let reelUrl = text;
    if (text.startsWith("/reel")) {
      const [, ...rest] = text.split(" ");
      reelUrl = rest.join(" ").trim();
    }

    if (!reelUrl.startsWith("http")) {
      await sendMessage(chatId, "❌ Invalid Instagram URL.");
      return new Response("Invalid URL");
    }

    // Show downloading message
    const msg = await sendMessage(chatId, "📥 Downloading Instagram reel...");
    const messageId = msg?.result?.message_id;

    try {
      const apiRes = await fetch("https://jerrycoder.oggyapi.workers.dev/insta?url=" + encodeURIComponent(reelUrl));
      const json = await apiRes.json();

      if (!json.status || !json.data || !json.data[0]?.url) {
        await deleteMessage(chatId, messageId);
        await sendMessage(chatId, "❌ Failed to fetch the video.");
        return new Response("No video found");
      }

      const videoUrl = json.data[0].url;

      // Delete downloading message
      if (messageId) await deleteMessage(chatId, messageId);

      // Send video
      await sendVideo(chatId, videoUrl);

    } catch (e) {
      if (messageId) await deleteMessage(chatId, messageId);
      await sendMessage(chatId, "❌ Error downloading the reel.");
      console.error(e);
    }

    return new Response("OK");
  }
};

const BOT_TOKEN = "8139678579:AAEc338z-0Gt45ZPsf35DJSCbaKm8JLvju4"; // Master bot token

async function sendMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  return res.json();
}

async function sendVideo(chatId, videoUrl) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`;
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

async function deleteMessage(chatId, messageId) {
  if (!messageId) return;
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`;
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
  });
}
