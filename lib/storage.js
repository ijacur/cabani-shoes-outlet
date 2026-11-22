const fs = require("fs");
const path = require("path");
const https = require("https");
const bcrypt = require("bcryptjs");

const DATA_DIR = path.join(__dirname, "..", "data");
const LOCAL_DB_PATH = path.join(DATA_DIR, "cabani_db.json");

if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
}

if (process.env.NODE_ENV === "production" && String(process.env.ADMIN_PASSWORD || "").length < 14) {
  throw new Error("ADMIN_PASSWORD must be set to at least 14 characters in production");
}
// The fallback is for local development and tests only; production refuses to start without ADMIN_PASSWORD.
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Cabani2026!";
const DEFAULT_PASSWORD_HASH = bcrypt.hashSync(DEFAULT_ADMIN_PASSWORD, 10);

const SEED_PRODUCTS = [
  {
    id: 1,
    name: "CABANI Loafers Premium Leather",
    category: "shoes",
    description: "Классические мужские лоферы из натуральной итальянской кожи. Мягкая стелька, фирменная ручная строчка и долговечная подошва.",
    price: 890000,
    old_price: 1150000,
    sizes: ["39", "40", "41", "42", "43", "44"],
    image: "https://images.unsplash.com/photo-1533867617858-e7b97e060509?auto=format&fit=crop&w=900&q=85",
    active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 2,
    name: "CABANI Urban Runner Sneakers",
    category: "shoes",
    description: "Премиальные городские кроссовки из комбинации кожи и замши. Амортизирующая подошва для максимального комфорта на каждый день.",
    price: 740000,
    old_price: 950000,
    sizes: ["40", "41", "42", "43", "44", "45"],
    image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=85",
    active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 3,
    name: "CABANI Chelsea Boots Classic",
    category: "shoes",
    description: "Элегантные ботинки челси из плотной кожи растительного дубления с эластичными вставками. Идеальный выбор под брюки и деним.",
    price: 1120000,
    old_price: 1450000,
    sizes: ["40", "41", "42", "43", "44"],
    image: "https://images.unsplash.com/photo-1638247025967-b4e38f787b76?auto=format&fit=crop&w=900&q=85",
    active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 4,
    name: "CABANI Classic Oxford Derbys",
    category: "shoes",
    description: "Строгие мужские дерби глубокого черного цвета. Вощеная кожа, безупречная посадка и респектабельный вид.",
    price: 980000,
    old_price: 1290000,
    sizes: ["39", "40", "41", "42", "43", "44"],
    image: "https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?auto=format&fit=crop&w=900&q=85",
    active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 5,
    name: "CABANI City Essential Leather Belt",
    category: "accessories",
    description: "Ремень из цельной натуральной кожи с матовой лаконичной пряжкой. Ширина 3.5 см.",
    price: 280000,
    old_price: 350000,
    sizes: ["105 см", "115 см", "125 см"],
    image: "https://images.unsplash.com/photo-1624222247344-550fb60583dc?auto=format&fit=crop&w=900&q=85",
    active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 6,
    name: "CABANI Executive Slim Wallet",
    category: "accessories",
    description: "Тонкое портмоне из мелкозернистой кожи с защитой RFID и отделениями для карт и купюр.",
    price: 320000,
    old_price: 420000,
    sizes: ["ONE SIZE"],
    image: "https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=900&q=85",
    active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

class Storage {
  constructor() {
    this.gistId = process.env.GIST_ID || "6a746fabd58925a3395f38092eb18192";
    this.githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
    this.memoryDb = {
      products: [...SEED_PRODUCTS],
      orders: [],
      nextProductId: 7,
      nextOrderId: 1001,
      admin: {
        username: process.env.ADMIN_USERNAME || "admin",
        password_hash: DEFAULT_PASSWORD_HASH
      },
      settings: {
        storeName: process.env.STORE_NAME || "CABANI SHOES OUTLET",
        whatsappNumber: process.env.WHATSAPP_NUMBER || "998901234567",
        telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
        telegramChatId: process.env.TELEGRAM_CHAT_ID || ""
      }
    };
    this.isLoaded = false;
    this.syncPromise = null;
    this.init();
  }

  async init() {
    // 1. Try local disk first
    if (fs.existsSync(LOCAL_DB_PATH)) {
      try {
        const raw = fs.readFileSync(LOCAL_DB_PATH, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed.products && parsed.products.length) {
          this.memoryDb = { ...this.memoryDb, ...parsed };
          this.isLoaded = true;
        }
      } catch (e) {
        console.warn("Could not read local DB:", e.message);
      }
    }

    // 2. Try remote Gist to get latest cloud state
    if (this.gistId && this.githubToken) {
      try {
        const cloudData = await this.fetchFromGist();
        if (cloudData && cloudData.products && cloudData.products.length) {
          this.memoryDb = { ...this.memoryDb, ...cloudData };
          this.saveLocal();
          this.isLoaded = true;
          return;
        } else {
          // If gist is empty or fresh, push initial seed to gist
          await this.saveToGist();
        }
      } catch (err) {
        console.warn("Gist sync init warning:", err.message);
      }
    }

    this.saveLocal();
    this.isLoaded = true;
  }

  saveLocal() {
    try {
      fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(this.memoryDb, null, 2), "utf8");
    } catch {}
  }

  async persist() {
    this.saveLocal();
    if (this.gistId && this.githubToken) {
      this.saveToGist().catch(e => console.warn("Background Gist save error:", e.message));
    }
  }

  fetchFromGist() {
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: "api.github.com",
        path: `/gists/${this.gistId}`,
        method: "GET",
        headers: {
          "User-Agent": "CabaniShoesApp",
          "Authorization": `token ${this.githubToken}`
        },
        timeout: 6000
      }, res => {
        let body = "";
        res.on("data", c => body += c);
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const gist = JSON.parse(body);
              const file = gist.files && gist.files["cabani_data.json"];
              if (file && file.content) {
                resolve(JSON.parse(file.content));
              } else {
                resolve(null);
              }
            } catch (err) {
              reject(err);
            }
          } else {
            reject(new Error(`Gist HTTP ${res.statusCode}`));
          }
        });
      });
      req.on("error", reject);
      req.on("timeout", () => req.destroy(new Error("Timeout")));
      req.end();
    });
  }

  saveToGist() {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        description: "CABANI SHOES OUTLET Database (Updated " + new Date().toISOString() + ")",
        files: {
          "cabani_data.json": {
            content: JSON.stringify(this.memoryDb, null, 2)
          }
        }
      });

      const req = https.request({
        hostname: "api.github.com",
        path: `/gists/${this.gistId}`,
        method: "PATCH",
        headers: {
          "User-Agent": "CabaniShoesApp",
          "Authorization": `token ${this.githubToken}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        },
        timeout: 8000
      }, res => {
        let body = "";
        res.on("data", c => body += c);
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(true);
          } else {
            resolve(false);
          }
        });
      });
      req.on("error", () => resolve(false));
      req.on("timeout", () => { req.destroy(); resolve(false); });
      req.write(payload);
      req.end();
    });
  }

  // --- Products ---
  getProducts({ activeOnly = false } = {}) {
    let list = this.memoryDb.products || [];
    if (activeOnly) {
      list = list.filter(p => Number(p.active) === 1);
    }
    return list;
  }

  getProduct(id) {
    return (this.memoryDb.products || []).find(p => Number(p.id) === Number(id)) || null;
  }

  async createProduct(data) {
    const id = this.memoryDb.nextProductId++;
    const now = new Date().toISOString();
    const product = {
      id,
      name: String(data.name || "").trim(),
      category: String(data.category || "shoes"),
      description: String(data.description || "").trim(),
      price: Math.max(0, Number(data.price || 0)),
      old_price: data.old_price ? Math.max(0, Number(data.old_price)) : null,
      sizes: Array.isArray(data.sizes) ? data.sizes : (typeof data.sizes === "string" ? JSON.parse(data.sizes || "[]") : []),
      image: String(data.image || "").trim(),
      active: data.active ? 1 : 0,
      created_at: now,
      updated_at: now
    };
    this.memoryDb.products.unshift(product);
    await this.persist();
    return product;
  }

  async updateProduct(id, data) {
    const index = (this.memoryDb.products || []).findIndex(p => Number(p.id) === Number(id));
    if (index === -1) return null;
    const current = this.memoryDb.products[index];
    const updated = {
      ...current,
      name: data.name !== undefined ? String(data.name).trim() : current.name,
      category: data.category !== undefined ? String(data.category) : current.category,
      description: data.description !== undefined ? String(data.description).trim() : current.description,
      price: data.price !== undefined ? Math.max(0, Number(data.price)) : current.price,
      old_price: data.old_price !== undefined ? (data.old_price ? Math.max(0, Number(data.old_price)) : null) : current.old_price,
      sizes: data.sizes !== undefined ? (Array.isArray(data.sizes) ? data.sizes : JSON.parse(data.sizes || "[]")) : current.sizes,
      image: data.image !== undefined ? (String(data.image).trim() || current.image) : current.image,
      active: data.active !== undefined ? (data.active ? 1 : 0) : current.active,
      updated_at: new Date().toISOString()
    };
    this.memoryDb.products[index] = updated;
    await this.persist();
    return updated;
  }

  async deleteProduct(id) {
    const index = (this.memoryDb.products || []).findIndex(p => Number(p.id) === Number(id));
    if (index === -1) return false;
    this.memoryDb.products.splice(index, 1);
    await this.persist();
    return true;
  }

  // --- Orders ---
  getOrders() {
    return [...(this.memoryDb.orders || [])].sort((a, b) => Number(b.id) - Number(a.id));
  }

  getOrder(id) {
    return (this.memoryDb.orders || []).find(o => Number(o.id) === Number(id)) || null;
  }

  async createOrder(data) {
    const id = this.memoryDb.nextOrderId++;
    const now = new Date().toISOString();
    const order = {
      id,
      customer_name: String(data.name || "").trim(),
      phone: String(data.phone || "").trim(),
      address: String(data.address || "").trim(),
      comment: String(data.comment || "").trim(),
      items: Array.isArray(data.items) ? data.items : [],
      items_json: JSON.stringify(data.items || []),
      total: Number(data.total || 0),
      status: "new",
      created_at: now
    };
    this.memoryDb.orders.unshift(order);
    await this.persist();
    return order;
  }

  async updateOrderStatus(id, status) {
    const allowed = ["new", "confirmed", "processing", "shipped", "completed", "cancelled"];
    if (!allowed.includes(status)) throw new Error("Недопустимый статус");
    const order = (this.memoryDb.orders || []).find(o => Number(o.id) === Number(id));
    if (!order) return null;
    order.status = status;
    order.updated_at = new Date().toISOString();
    await this.persist();
    return order;
  }

  // --- Stats ---
  getStats() {
    const products = (this.memoryDb.products || []).length;
    const active = (this.memoryDb.products || []).filter(p => Number(p.active) === 1).length;
    const ordersList = this.memoryDb.orders || [];
    const orders = ordersList.length;
    const newOrders = ordersList.filter(o => o.status === "new").length;
    const revenue = ordersList
      .filter(o => ["completed", "shipped"].includes(o.status))
      .reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    return { products, active, orders, newOrders, revenue };
  }

  // --- Settings ---
  getSettings() {
    return {
      storeName: this.memoryDb.settings?.storeName || process.env.STORE_NAME || "CABANI SHOES OUTLET",
      whatsappNumber: this.memoryDb.settings?.whatsappNumber || process.env.WHATSAPP_NUMBER || "998901234567",
      telegramBotToken: this.memoryDb.settings?.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || "",
      telegramChatId: this.memoryDb.settings?.telegramChatId || process.env.TELEGRAM_CHAT_ID || ""
    };
  }

  async updateSettings(data) {
    if (!this.memoryDb.settings) this.memoryDb.settings = {};
    if (data.storeName !== undefined) this.memoryDb.settings.storeName = String(data.storeName).trim();
    if (data.whatsappNumber !== undefined) this.memoryDb.settings.whatsappNumber = String(data.whatsappNumber).trim();
    if (data.telegramBotToken !== undefined) this.memoryDb.settings.telegramBotToken = String(data.telegramBotToken).trim();
    if (data.telegramChatId !== undefined) this.memoryDb.settings.telegramChatId = String(data.telegramChatId).trim();
    await this.persist();
    return this.getSettings();
  }

  // --- Admin Auth ---
  getAdmin(username = "admin") {
    // Only the stored admin may log in. Returning a default-password account for
    // unknown usernames let the default password keep working after it was changed.
    if (this.memoryDb.admin && this.memoryDb.admin.username === username) {
      return this.memoryDb.admin;
    }
    return null;
  }

  async updateAdminPassword(username, newPassword) {
    if (!this.memoryDb.admin) this.memoryDb.admin = { username: "admin" };
    this.memoryDb.admin.username = username;
    this.memoryDb.admin.password_hash = bcrypt.hashSync(newPassword, 10);
    await this.persist();
    return true;
  }
}

const storage = new Storage();
module.exports = storage;
