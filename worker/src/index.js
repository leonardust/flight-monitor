const COMMANDS = ["/sprawdz", "/check"];

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("OK");

    if (env.TELEGRAM_SECRET) {
      const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (secret !== env.TELEGRAM_SECRET) return new Response("OK");
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("OK");
    }

    if (body?.callback_query) {
      const cq = body.callback_query;
      const chatId = String(cq.message?.chat?.id ?? "");
      const data = cq.data ?? "";
      if (chatId !== String(env.TELEGRAM_CHAT_ID)) {
        await answerCallbackQuery(env, cq.id);
        return new Response("OK");
      }
      try {
        await handleCallbackQuery(env, chatId, data, cq.id);
      } catch (err) {
        console.error(`Callback query error: ${err.message}`);
        await answerCallbackQuery(env, cq.id);
      }
      return new Response("OK");
    }

    const message = body?.message;
    if (!message) return new Response("OK");

    const chatId = String(message.chat?.id ?? "");
    const text = (message.text ?? "").trim().split("@")[0];

    if (chatId !== String(env.TELEGRAM_CHAT_ID)) return new Response("OK");

    if (COMMANDS.includes(text)) {
      try {
        await sendPassengerQuestion(env, chatId, "adults", {});
      } catch (err) {
        console.error(`Command handler error: ${err.message}`);
      }
    }

    return new Response("OK");
  },
};

async function handleCallbackQuery(env, chatId, data, callbackQueryId) {
  if (!data.startsWith("p:")) {
    await answerCallbackQuery(env, callbackQueryId);
    return;
  }

  const params = parsePassengerData(data);

  if (!("t" in params)) {
    await Promise.all([
      answerCallbackQuery(env, callbackQueryId),
      sendPassengerQuestion(env, chatId, "teens", params),
    ]);
    return;
  }

  if (!("c" in params)) {
    await Promise.all([
      answerCallbackQuery(env, callbackQueryId),
      sendPassengerQuestion(env, chatId, "children", params),
    ]);
    return;
  }

  if (!("i" in params)) {
    await Promise.all([
      answerCallbackQuery(env, callbackQueryId),
      sendPassengerQuestion(env, chatId, "infants", params),
    ]);
    return;
  }

  const passengers = {
    adults: params.a,
    teens: params.t,
    children: params.c,
    infants: params.i,
  };
  await Promise.all([
    answerCallbackQuery(env, callbackQueryId),
    triggerReport(env, passengers),
    sendTelegram(
      env,
      chatId,
      `🔍 Sprawdzam dla: ${formatPassengerSummary(passengers)}. Wyniki za chwilę…`,
    ),
  ]);
}

function parsePassengerData(data) {
  const result = {};
  for (const pair of data.slice(2).split(",")) {
    const [key, val] = pair.split("=");
    if (key && val !== undefined) result[key] = parseInt(val, 10);
  }
  return result;
}

function buildCallbackData(params, key, val) {
  const next = { ...params, [key]: val };
  return (
    "p:" +
    Object.entries(next)
      .map(([k, v]) => `${k}=${v}`)
      .join(",")
  );
}

function formatPassengerSummary({ adults, teens, children, infants }) {
  const parts = [];
  if (adults) parts.push(`${adults} dor.`);
  if (teens) parts.push(`${teens} nast.`);
  if (children) parts.push(`${children} dzieci`);
  if (infants) parts.push(`${infants} niemowl.`);
  return parts.join(", ") || "0 pasażerów";
}

async function sendPassengerQuestion(env, chatId, step, params) {
  const steps = {
    adults: {
      text: "👤 Ile dorosłych? (16+)",
      values: [1, 2, 3, 4, 5, 6],
      key: "a",
    },
    teens: {
      text: "🧑 Ile nastolatków? (12–15)",
      values: [0, 1, 2, 3, 4],
      key: "t",
    },
    children: {
      text: "👧 Ile dzieci? (2–11)",
      values: [0, 1, 2, 3, 4],
      key: "c",
    },
    infants: { text: "👶 Ile niemowląt? (0–1)", values: [0, 1, 2], key: "i" },
  };
  const { text, values, key } = steps[step];
  const buttons = values.map((v) => ({
    text: String(v),
    callback_data: buildCallbackData(params, key, v),
  }));
  await sendTelegramWithKeyboard(env, chatId, text, [buttons]);
}

async function triggerReport(env, passengers) {
  const inputs = {
    adults: String(passengers.adults),
    teens: String(passengers.teens),
    children: String(passengers.children),
    infants: String(passengers.infants),
  };
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
      body: JSON.stringify({ ref: env.GH_REF, inputs }),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    console.error(`GitHub dispatch failed: ${res.status} ${text}`);
  }
}

async function answerCallbackQuery(env, callbackQueryId) {
  await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/answerCallbackQuery`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId }),
    },
  );
}

async function sendTelegram(env, chatId, text) {
  const res = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    console.error(`Telegram sendMessage failed: ${res.status} ${body}`);
  }
}

async function sendTelegramWithKeyboard(env, chatId, text, keyboard) {
  const res = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_markup: { inline_keyboard: keyboard },
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    console.error(`Telegram sendMessage failed: ${res.status} ${body}`);
  }
}
