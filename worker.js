export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method !== "POST") return new Response("Only POST allowed");

    const update = await request.json();
    const message = update.message || update.edited_message;
    const text = message?.text || "";
    const chatId = message?.chat?.id;

    if (!chatId || !text) return new Response("No message");

    const INSTAGRAM_API = "https://jerrycoder.oggyapi.workers.dev/insta?url=";

    const isInstaUrl = text.includes("instagram.com/reel/") || text.startsWith("/reel");

    if (!isInstaUrl) return new Response("Not an Instagram reel command");

    let reelUrl = text;
    if (text.startsWith("/reel")) {
      const [, ...rest] = text.split(" ");
      reelUrl = rest.join(" ").trim();
    }

    if (!reelUrl.startsWith("http")) {
      await sendMessage(chatId, "❌ Invalid Instagram URL.");
      return new Response("Invalid URL");
    }

    await sendMessage(chatId, "📥 Downloading Instagram reel...");

    try {
      const apiRes = await fetch(INSTAGRAM_API + encodeURIComponent(reelUrl));
      const json = await apiRes.json();

      if (!json.status || !json.data || !json.data[0]?.url) {
        await sendMessage(chatId, "❌ Failed to fetch the video.");
        return new Response("No video found");
      }

      const videoUrl = json.data[0].url;

      await sendVideo(chatId, videoUrl);

    } catch (e) {
      await sendMessage(chatId, "❌ Error downloading the reel.");
      console.error(e);
    }

    return new Response("OK");
  }
};

const BOT_TOKEN = "8139678579:AAEc338z-0Gt45ZPsf35DJSCbaKm8JLvju4"; // replace with actual bot token

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
