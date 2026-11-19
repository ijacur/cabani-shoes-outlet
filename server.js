require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");

const storage = require("./lib/storage");
const telegram = require("./lib/telegram");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");

const SESSION_SECRET = process.env.SESSION_SECRET || "cabani-outlet-secret-key-2026-secure-token";

function signToken(username) {
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = `${username}|${expiresAt}`;
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  return `${payload}|${signature}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split("|");
  if (parts.length !== 3) return null;
  const [username, expiresAtStr, signature] = parts;
  const expiresAt = Number(expiresAtStr);
  if (Date.now() > expiresAt) return null;
  const expectedSignature = crypto.createHmac("sha256", SESSION_SECRET).update(`${username}|${expiresAtStr}`).digest("hex");
  if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return { username, expiresAt };
  }
  return null;
}

function auth(req, res, next) {
  const token = req.cookies?.cabani_admin_token || req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const session = verifyToken(token);
  if (!session) {
    return res.status(401).json({ error: "Требуется авторизация" });
  }
  req.admin = session;
  next();
}

app.disable("x-powered-by");
if (process.env.TRUST_PROXY === "1" || process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cookieParser());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// Static files
app.use(express.static(PUBLIC, { maxAge: "1h" }));

// Health Check
app.get("/healthz", (req, res) => {
  res.json({ ok: true, service: "cabani-shoes-outlet", timestamp: new Date().toISOString() });
});

// --- Storefront APIs ---
app.get("/api/store", (req, res) => {
  const settings = storage.getSettings();
  const products = storage.getProducts({ activeOnly: true });
  res.json({
    storeName: settings.storeName,
    whatsappNumber: settings.whatsappNumber,
    products
  });
});

app.post("/api/orders", async (req, res) => {
  try {
    const { name, phone, address, comment, items } = req.body;
    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ error: "Пожалуйста, укажите имя покупателя" });
    }
    if (!phone || String(phone).trim().length < 7) {
      return res.status(400).json({ error: "Пожалуйста, укажите контактный номер телефона" });
    }
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: "Корзина пуста" });
    }

    // Verify and calculate prices server-side
    let calculatedTotal = 0;
    const verifiedItems = [];

    for (const item of items) {
      const product = storage.getProduct(item.productId);
      if (!product || !product.active) continue;
      const qty = Math.max(1, Math.min(20, Number(item.qty) || 1));
      const chosenSize = String(item.size || (product.sizes && product.sizes[0]) || "Стандарт");
      calculatedTotal += product.price * qty;
      verifiedItems.push({
        productId: product.id,
        name: product.name,
        price: product.price,
        size: chosenSize,
        qty
      });
    }

    if (!verifiedItems.length) {
      return res.status(400).json({ error: "Выбранные товары недоступны для заказа" });
    }

    const order = await storage.createOrder({
      name,
      phone,
      address,
      comment,
      items: verifiedItems,
      total: calculatedTotal
    });

    // Send Telegram Notification in background
    const settings = storage.getSettings();
    telegram.sendOrderNotification(order, settings).catch(err => {
      console.warn("Could not dispatch Telegram alert:", err);
    });

    res.status(201).json({
      ok: true,
      orderId: order.id,
      total: order.total,
      message: `Заказ #${order.id} успешно принят!`
    });
  } catch (err) {
    console.error("Order creation error:", err);
    res.status(500).json({ error: "Не удалось оформить заказ. Попробуйте еще раз." });
  }
});

// --- Admin APIs ---
app.post("/api/admin/login", (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  const admin = storage.getAdmin(username);

  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).json({ error: "Неверный логин или пароль администратора" });
  }

  const token = signToken(admin.username);
  res.cookie("cabani_admin_token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 7 * 24 * 60 * 60 * 1000
  });

  res.json({ ok: true, token, username: admin.username });
});

app.post("/api/admin/logout", (req, res) => {
  res.clearCookie("cabani_admin_token");
  res.json({ ok: true });
});

app.get("/api/admin/me", auth, (req, res) => {
  res.json({ ok: true, username: req.admin.username });
});

app.get("/api/admin/products", auth, (req, res) => {
  res.json(storage.getProducts({ activeOnly: false }));
});

app.post("/api/admin/products", auth, async (req, res) => {
  try {
    const { name, category, price, old_price, sizes, description, image, active } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Укажите название товара" });
    if (price === undefined || isNaN(price)) return res.status(400).json({ error: "Укажите корректную цену" });

    const product = await storage.createProduct({
      name,
      category: category || "shoes",
      price,
      old_price: old_price || null,
      sizes: sizes || [],
      description: description || "",
      image: image || "",
      active: active !== undefined ? active : 1
    });

    res.status(201).json(product);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.put("/api/admin/products/:id", auth, async (req, res) => {
  try {
    const updated = await storage.updateProduct(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: "Товар не найден" });
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete("/api/admin/products/:id", auth, async (req, res) => {
  try {
    const success = await storage.deleteProduct(req.params.id);
    if (!success) return res.status(404).json({ error: "Товар не найден" });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/admin/orders", auth, (req, res) => {
  res.json(storage.getOrders());
});

app.patch("/api/admin/orders/:id", auth, async (req, res) => {
  try {
    const status = String(req.body.status || "");
    const updated = await storage.updateOrderStatus(req.params.id, status);
    if (!updated) return res.status(404).json({ error: "Заказ не найден" });
    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/admin/stats", auth, (req, res) => {
  res.json(storage.getStats());
});

app.get("/api/admin/settings", auth, (req, res) => {
  res.json(storage.getSettings());
});

app.post("/api/admin/settings", auth, async (req, res) => {
  try {
    const updated = await storage.updateSettings(req.body);
    res.json({ ok: true, settings: updated });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post("/api/admin/test-telegram", auth, async (req, res) => {
  try {
    const currentSettings = storage.getSettings();
    const token = req.body.token || currentSettings.telegramBotToken;
    const chatId = req.body.chatId || currentSettings.telegramChatId;

    if (!token || !chatId) {
      return res.status(400).json({ error: "Укажите Telegram Bot Token и Chat ID" });
    }

    const result = await telegram.sendTestNotification(token, chatId);
    if (result.ok) {
      res.json({ ok: true, message: "Тестовое уведомление успешно отправлено в Telegram!" });
    } else {
      res.status(400).json({ error: result.error || "Ошибка отправки в Telegram" });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/admin/change-password", auth, async (req, res) => {
  try {
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");
    const admin = storage.getAdmin(req.admin.username);

    if (!bcrypt.compareSync(currentPassword, admin.password_hash)) {
      return res.status(400).json({ error: "Текущий пароль неверен" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Новый пароль должен содержать минимум 8 символов" });
    }

    await storage.updateAdminPassword(admin.username, newPassword);
    res.json({ ok: true, message: "Пароль успешно обновлен" });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Admin panel direct page
app.get("/admin", (req, res) => {
  res.sendFile(path.join(PUBLIC, "admin.html"));
});

// Storefront direct page
app.get("/", (req, res) => {
  res.sendFile(path.join(PUBLIC, "index.html"));
});

// Catch-all
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Произошла внутренняя ошибка сервера" });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`CABANI SHOES OUTLET is running at http://localhost:${PORT}`);
    console.log(`Admin dashboard: http://localhost:${PORT}/admin`);
  });
}

module.exports = app;
