const https = require("https");

function formatMoney(amount) {
  return new Intl.NumberFormat("ru-RU").format(amount) + " сум";
}

function escapeTelegram(str) {
  return String(str ?? "").replace(/[&<>"]/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;"
  }[c]));
}

function sendTelegramMessage(token, chatId, text) {
  if (!token || !chatId) {
    console.warn("Telegram bot token or chat ID is missing");
    return Promise.resolve({ ok: false, error: "Токен бота или Chat ID не настроены" });
  }

  const payload = JSON.stringify({
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true
  });

  return new Promise(resolve => {
    const req = https.request({
      hostname: "api.telegram.org",
      path: `/bot${token}/sendMessage`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload)
      },
      timeout: 8000
    }, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.ok) {
            resolve({ ok: true, result: json.result });
          } else {
            console.error("Telegram API error:", json.description);
            resolve({ ok: false, error: json.description || `HTTP ${res.statusCode}` });
          }
        } catch (e) {
          resolve({ ok: false, error: "Некорректный ответ Telegram API" });
        }
      });
    });

    req.on("error", err => {
      console.error("Telegram network error:", err.message);
      resolve({ ok: false, error: err.message });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "Таймаут соединения с Telegram" });
    });

    req.write(payload);
    req.end();
  });
}

async function sendOrderNotification(order, settings = {}) {
  const token = settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;
  const chatId = settings.telegramChatId || process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log("Telegram notification skipped: Bot token or Chat ID not configured.");
    return { ok: false, skipped: true };
  }

  const itemsLines = (order.items || []).map(item => {
    const sizeStr = item.size ? ` (Размер: <b>${escapeTelegram(item.size)}</b>)` : "";
    return `• <b>${escapeTelegram(item.name)}</b>${sizeStr}\n  ${item.qty} шт. × ${formatMoney(item.price)} = <b>${formatMoney(item.price * item.qty)}</b>`;
  });

  const lines = [
    "🛍️ <b>НОВЫЙ ЗАКАЗ — CABANI SHOES OUTLET</b>",
    "━━━━━━━━━━━━━━━━━━━━━━━",
    `📦 Номер заказа: <b>#${order.id}</b>`,
    `👤 Покупатель: <b>${escapeTelegram(order.customer_name)}</b>`,
    `📞 Телефон: <b>${escapeTelegram(order.phone)}</b>`,
    order.address ? `📍 Адрес: ${escapeTelegram(order.address)}` : "📍 Адрес: Не указан (самовывоз/уточнить)",
    order.comment ? `💬 Комментарий: <i>${escapeTelegram(order.comment)}</i>` : "",
    "",
    "👟 <b>Товары в заказе:</b>",
    ...itemsLines,
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━",
    `💰 <b>ИТОГО К ОПЛАТЕ: ${formatMoney(order.total)}</b>`,
    `⏰ Время: ${new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" })} (Ташкент)`,
    "━━━━━━━━━━━━━━━━━━━━━━━"
  ].filter(line => line !== null && line !== undefined);

  return sendTelegramMessage(token, chatId, lines.join("\n"));
}

async function sendTestNotification(token, chatId) {
  const text = [
    "🔔 <b>CABANI SHOES OUTLET — ПРОВЕРКА СВЯЗИ</b>",
    "━━━━━━━━━━━━━━━━━━━━━━━",
    "✅ Поздравляем! Ваш Telegram бот успешно подключен к магазину.",
    "Теперь при оформлении любого заказа на сайте вы будете мгновенно получать сюда полное уведомление с составом заказа, телефоном и адресом клиента.",
    "",
    `⏰ Время проверки: ${new Date().toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" })}`
  ].join("\n");

  return sendTelegramMessage(token, chatId, text);
}

module.exports = {
  sendOrderNotification,
  sendTestNotification,
  formatMoney,
  escapeTelegram
};
