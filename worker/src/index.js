const COMMANDS = ["/sprawdz", "/check"];

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("OK");

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("OK");
    }

    const message = body?.message;
    if (!message) return new Response("OK");

    const chatId = String(message.chat?.id ?? "");
    const text = (message.text ?? "").trim().split("@")[0];

    if (chatId !== String(env.TELEGRAM_CHAT_ID)) return new Response("OK");

    if (COMMANDS.includes(text)) {
      await Promise.all([
        triggerReport(env),
        sendTelegram(env, chatId, "🔍 Sprawdzam ceny, wyniki za chwilę…"),
      ]);
    }

    return new Response("OK");
  },
};

async function triggerReport(env) {
  const res = await fetch(
    `https://api.github.com/repos/${env.GH_REPO}/actions/workflows/report.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `token ${env.GH_PAT}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "flight-monitor-bot",
      },
      body: JSON.stringify({ ref: env.GH_REF }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    console.error(`GitHub dispatch failed: ${res.status} ${text}`);
  }
}

async function sendTelegram(env, chatId, text) {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}
