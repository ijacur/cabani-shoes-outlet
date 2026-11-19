const $ = s => document.querySelector(s);
const money = n => new Intl.NumberFormat("ru-RU").format(n) + " сум";

const labels = {
  new: "🟡 Новый",
  confirmed: "🔵 Подтверждён",
  processing: "🟣 В обработке",
  shipped: "🚚 Отправлен",
  completed: "🟢 Завершён",
  cancelled: "🔴 Отменён"
};

let products = [];
let orders = [];
let editing = null;
let currentPhotoData = "";

async function api(url, opts = {}) {
  const token = localStorage.getItem("cabani_jwt") || "";
  const res = await fetch(url, {
    credentials: "same-origin",
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      ...(opts.headers || {})
    }
  });

  let data = {};
  try {
    data = await res.json();
  } catch {}

  if (!res.ok) {
    throw new Error(data.error || "Ошибка запроса к серверу");
  }
  return data;
}

function toast(msg, isError = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.style.background = isError ? "#992222" : "#191916";
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function sanitizePhoneForWa(phone) {
  return String(phone || "").replace(/[^\d]/g, "");
}

// Client-side image compression
function compressImage(file, maxDimension = 1200, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = e => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        // Try WebP first, fallback to JPEG
        let dataUrl = canvas.toDataURL("image/webp", quality);
        if (!dataUrl.startsWith("data:image/webp")) {
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }
        resolve(dataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function showApp() {
  $("#loginView").classList.add("hidden");
  $("#appView").classList.remove("hidden");
  loadAll();
}

async function checkAuth() {
  try {
    await api("/api/admin/me");
    showApp();
  } catch {
    $("#loginView").classList.remove("hidden");
  }
}

// Login
$("#loginForm").onsubmit = async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    const res = await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(fd))
    });
    if (res.token) localStorage.setItem("cabani_jwt", res.token);
    $("#loginError").textContent = "";
    showApp();
  } catch (err) {
    $("#loginError").textContent = err.message;
  }
};

// Logout
$("#logoutBtn").onclick = async () => {
  try { await api("/api/admin/logout", { method: "POST" }); } catch {}
  localStorage.removeItem("cabani_jwt");
  location.reload();
};

// Navigation
document.querySelectorAll("[data-tab]").forEach(b => b.onclick = () => switchTab(b.dataset.tab));
document.querySelectorAll("[data-goto]").forEach(b => b.onclick = () => switchTab(b.dataset.goto));

function switchTab(tab) {
  document.querySelectorAll(".tab").forEach(x => x.classList.add("hidden"));
  const target = $("#" + tab + "Tab");
  if (target) target.classList.remove("hidden");
  document.querySelectorAll("[data-tab]").forEach(x => x.classList.toggle("active", x.dataset.tab === tab));

  const titles = {
    overview: "Обзор магазина",
    products: "Каталог товаров",
    orders: "Управление заказами",
    settings: "Настройки магазина и Telegram"
  };
  $("#pageTitle").textContent = titles[tab] || "Панель управления";
  $("#pageName").textContent = (titles[tab] || tab).toUpperCase();

  if (tab === "settings") loadSettings();
}

async function loadAll() {
  try {
    const [p, o, s] = await Promise.all([
      api("/api/admin/products"),
      api("/api/admin/orders"),
      api("/api/admin/stats")
    ]);
    products = p;
    orders = o;
    renderStats(s);
    renderProducts();
    renderOrders();
    renderOverviewRecent();
  } catch (e) {
    toast(e.message, true);
  }
}

function renderStats(s) {
  $("#statProducts").textContent = s.products;
  $("#statActive").textContent = s.active;
  $("#statOrders").textContent = s.orders;
  $("#statNew").textContent = s.newOrders;
  $("#statRevenue").textContent = money(s.revenue);

  const badge = $("#newBadge");
  if (s.newOrders > 0) {
    badge.textContent = s.newOrders;
    badge.style.display = "inline-block";
  } else {
    badge.style.display = "none";
  }
}

function renderOverviewRecent() {
  const recent = orders.slice(0, 6);
  $("#recentOrders").innerHTML = recent.length ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>ЗАКАЗ</th>
            <th>ПОКУПАТЕЛЬ</th>
            <th>СОСТАВ</th>
            <th>СУММА</th>
            <th>СТАТУС</th>
          </tr>
        </thead>
        <tbody>
          ${recent.map(o => `
            <tr>
              <td><strong>#${o.id}</strong></td>
              <td>
                <b>${esc(o.customer_name)}</b><br>
                <a href="tel:${esc(o.phone)}" class="phone-link">📞 ${esc(o.phone)}</a>
              </td>
              <td>${(o.items || []).map(i => `${esc(i.name)} (${esc(i.size)}) × ${i.qty}`).join("<br>")}</td>
              <td><strong>${money(o.total)}</strong></td>
              <td><span class="status status-${o.status}">${labels[o.status] || o.status}</span></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  ` : "<p class='muted' style='padding: 20px 0;'>Новых заказов пока нет. Когда покупатели сделают заказ, он появится здесь.</p>";
}

function renderProducts() {
  const tbody = $("#productsBody");
  if (!products.length) {
    tbody.innerHTML = "<tr><td colspan='6' class='muted' style='text-align:center; padding:30px;'>Товары пока не добавлены. Нажмите «＋ Добавить товар» выше.</td></tr>";
    return;
  }

  tbody.innerHTML = products.map(p => {
    const catMap = { shoes: "Обувь", clothing: "Одежда", accessories: "Аксессуары" };
    const sizesStr = (p.sizes || []).map(s => `<span class="size-pill">${esc(s)}</span>`).join(" ");
    const discount = p.old_price && p.old_price > p.price
      ? `<br><small class="muted"><del>${money(p.old_price)}</del> (-${Math.round((1 - p.price / p.old_price) * 100)}%)</small>`
      : "";

    return `
      <tr>
        <td>
          <div class="item-cell">
            <img src="${p.image || '/placeholder.png'}" alt="" onerror="this.src='https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=150&q=80'">
            <div>
              <strong>${esc(p.name)}</strong>
              <small class="muted">ID: #${p.id}</small>
            </div>
          </div>
        </td>
        <td><span class="cat-pill">${catMap[p.category] || p.category}</span></td>
        <td><strong>${money(p.price)}</strong>${discount}</td>
        <td><div class="sizes-wrap">${sizesStr || "—"}</div></td>
        <td>
          <span class="status ${p.active ? 'status-completed' : 'status-cancelled'}">
            ${p.active ? '🟢 В магазине' : '⚪ Скрыт'}
          </span>
        </td>
        <td style="text-align: right;">
          <div class="actions" style="justify-content: flex-end;">
            <button class="mini" data-edit="${p.id}">✏️ Изменить</button>
            <button class="mini delete-btn" data-delete="${p.id}">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

function renderOrders() {
  const filter = $("#orderFilter").value;
  const list = orders.filter(o => filter === "all" || o.status === filter);
  const tbody = $("#ordersBody");

  if (!list.length) {
    tbody.innerHTML = "<tr><td colspan='6' class='muted' style='text-align:center; padding:30px;'>Заказов с таким статусом нет.</td></tr>";
    return;
  }

  tbody.innerHTML = list.map(o => {
    const waPhone = sanitizePhoneForWa(o.phone);
    const waLink = waPhone ? `<a href="https://wa.me/${waPhone}" target="_blank" class="wa-btn" title="Написать в WhatsApp">💬 WhatsApp</a>` : "";

    return `
      <tr>
        <td>
          <strong>#${o.id}</strong><br>
          <small class="muted">${o.address ? `📍 ${esc(o.address)}` : "Самовывоз"}</small>
        </td>
        <td>
          <strong>${esc(o.customer_name)}</strong><br>
          <div class="contact-links">
            <a href="tel:${esc(o.phone)}" class="phone-link">📞 ${esc(o.phone)}</a>
            ${waLink}
          </div>
          ${o.comment ? `<small class="comment-box">💬 «${esc(o.comment)}»</small>` : ""}
        </td>
        <td>
          <div class="order-items-list">
            ${(o.items || []).map(i => `• <b>${esc(i.name)}</b> (${esc(i.size)}) × ${i.qty} = ${money(i.price * i.qty)}`).join("<br>")}
          </div>
        </td>
        <td><strong>${money(o.total)}</strong></td>
        <td>
          <select class="status-select status-${o.status}" data-status="${o.id}">
            ${Object.entries(labels).map(([k, v]) => `
              <option value="${k}" ${o.status === k ? "selected" : ""}>${v}</option>
            `).join("")}
          </select>
        </td>
        <td><small class="muted">${new Date(o.created_at).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" })}</small></td>
      </tr>
    `;
  }).join("");
}

// Order filter change
$("#orderFilter").onchange = renderOrders;

// Status selector inside orders table
$("#ordersBody").addEventListener("change", async e => {
  const s = e.target.closest("[data-status]");
  if (!s) return;
  const newStatus = s.value;
  try {
    await api(`/api/admin/orders/${s.dataset.status}`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus })
    });
    const o = orders.find(x => x.id === Number(s.dataset.status));
    if (o) o.status = newStatus;
    s.className = `status-select status-${newStatus}`;
    const stats = await api("/api/admin/stats");
    renderStats(stats);
    toast("Статус заказа #" + s.dataset.status + " обновлен");
  } catch (err) {
    toast(err.message, true);
  }
});

// Product Modal Handlers
function openProduct(p = null) {
  editing = p;
  currentPhotoData = p?.image || "";
  $("#productForm").reset();
  $("#productModalTitle").textContent = p ? "Изменить товар" : "Новый товар";
  $("#productForm").elements.id.value = p?.id || "";

  if (p) {
    for (const k of ["name", "category", "description", "price", "old_price"]) {
      $("#productForm").elements[k].value = p[k] ?? "";
    }
    $("#sizesInput").value = (p.sizes || []).join(", ");
    $("#productForm").elements.active.checked = !!p.active;
    $("#imageUrlInput").value = p.image?.startsWith("http") ? p.image : "";
    setPhotoPreview(p.image || "");
  } else {
    setPhotoPreview("");
    $("#productForm").elements.active.checked = true;
    $("#imageUrlInput").value = "";
  }

  $("#productError").textContent = "";
  $("#productBackdrop").classList.remove("hidden");
}

function closeProduct() {
  $("#productBackdrop").classList.add("hidden");
}

function setPhotoPreview(urlOrBase64) {
  currentPhotoData = urlOrBase64 || "";
  const preview = $("#imagePreview");
  const delBtn = $("#removePhotoBtn");

  if (currentPhotoData) {
    preview.src = currentPhotoData;
    preview.classList.remove("hidden");
    delBtn.classList.remove("hidden");
  } else {
    preview.src = "";
    preview.classList.add("hidden");
    delBtn.classList.add("hidden");
  }
}

$("#addProductBtn").onclick = () => openProduct();
$("#closeProduct").onclick = closeProduct;
$("#cancelProduct").onclick = closeProduct;
$("#removePhotoBtn").onclick = () => {
  setPhotoPreview("");
  $("#imageFileInput").value = "";
  $("#imageUrlInput").value = "";
};

// Quick sizes chips
document.querySelectorAll(".size-chip").forEach(chip => {
  chip.onclick = () => {
    $("#sizesInput").value = chip.dataset.sizes;
  };
});

// Product actions (edit / delete)
$("#productsBody").addEventListener("click", async e => {
  const edit = e.target.closest("[data-edit]");
  const del = e.target.closest("[data-delete]");

  if (edit) {
    openProduct(products.find(p => p.id === Number(edit.dataset.edit)));
  }
  if (del && confirm("Вы действительно хотите удалить этот товар из магазина?")) {
    try {
      await api(`/api/admin/products/${del.dataset.delete}`, { method: "DELETE" });
      await loadAll();
      toast("Товар успешно удален");
    } catch (err) {
      toast(err.message, true);
    }
  }
});

// Photo file select -> compress to WebP Base64
$("#imageFileInput").onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;

  toast("Оптимизация фотографии...");
  try {
    const compressed = await compressImage(file, 1200, 0.82);
    setPhotoPreview(compressed);
    $("#imageUrlInput").value = "";
    toast("Фото готово к публикации!");
  } catch (err) {
    toast("Ошибка обработки фотографии: " + err.message, true);
  }
};

// Photo URL input
$("#imageUrlInput").oninput = e => {
  const val = e.target.value.trim();
  if (val.startsWith("http")) {
    setPhotoPreview(val);
  }
};

// Product form submit (Create or Update)
$("#productForm").onsubmit = async e => {
  e.preventDefault();
  const f = e.target;
  const rawSizes = f.elements.sizes.value;
  const parsedSizes = rawSizes.split(",").map(x => x.trim()).filter(Boolean);

  if (!parsedSizes.length) {
    $("#productError").textContent = "Укажите хотя бы один размер товара (например: 41, 42, 43)";
    return;
  }

  const body = {
    name: f.elements.name.value.trim(),
    category: f.elements.category.value,
    description: f.elements.description.value.trim(),
    price: Number(f.elements.price.value),
    old_price: f.elements.old_price.value ? Number(f.elements.old_price.value) : null,
    sizes: parsedSizes,
    image: currentPhotoData,
    active: f.elements.active.checked ? 1 : 0
  };

  const id = f.elements.id.value;
  const btn = $("#saveProductBtn");
  btn.disabled = true;
  btn.textContent = "Сохранение...";

  try {
    await api(id ? `/api/admin/products/${id}` : "/api/admin/products", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(body)
    });
    closeProduct();
    await loadAll();
    toast(id ? "Товар успешно обновлен!" : "Новый товар опубликован в магазине!");
  } catch (err) {
    $("#productError").textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = "Сохранить товар";
  }
};

// --- Settings Section ---
async function loadSettings() {
  try {
    const s = await api("/api/admin/settings");
    $("#telegramBotTokenInput").value = s.telegramBotToken || "";
    $("#telegramChatIdInput").value = s.telegramChatId || "";
    $("#storeNameInput").value = s.storeName || "CABANI SHOES OUTLET";
    $("#whatsappNumberInput").value = s.whatsappNumber || "";
  } catch (err) {
    console.warn("Could not fetch settings:", err);
  }
}

// Save Telegram Settings
$("#telegramSettingsForm").onsubmit = async e => {
  e.preventDefault();
  const msg = $("#telegramMessage");
  msg.textContent = "Сохранение...";
  msg.className = "status-msg";

  try {
    const body = {
      telegramBotToken: $("#telegramBotTokenInput").value.trim(),
      telegramChatId: $("#telegramChatIdInput").value.trim()
    };
    await api("/api/admin/settings", { method: "POST", body: JSON.stringify(body) });
    msg.textContent = "✅ Настройки Telegram сохранены!";
    msg.className = "status-msg success";
    toast("Настройки Telegram сохранены");
  } catch (err) {
    msg.textContent = "❌ " + err.message;
    msg.className = "status-msg error";
  }
};

// Test Telegram Notification
$("#testTelegramBtn").onclick = async () => {
  const token = $("#telegramBotTokenInput").value.trim();
  const chatId = $("#telegramChatIdInput").value.trim();

  if (!token || !chatId) {
    toast("Сначала введите Bot Token и Chat ID!", true);
    return;
  }

  const msg = $("#telegramMessage");
  msg.textContent = "⏳ Отправка тестового сообщения в Telegram...";
  msg.className = "status-msg";

  try {
    const res = await api("/api/admin/test-telegram", {
      method: "POST",
      body: JSON.stringify({ token, chatId })
    });
    msg.textContent = "✅ " + res.message;
    msg.className = "status-msg success";
    toast("Проверьте Telegram! Сообщение доставлено.");
  } catch (err) {
    msg.textContent = "❌ Ошибка Telegram: " + err.message;
    msg.className = "status-msg error";
    toast(err.message, true);
  }
};

// Save Store Settings
$("#storeSettingsForm").onsubmit = async e => {
  e.preventDefault();
  const msg = $("#storeMessage");
  msg.textContent = "Сохранение...";
  msg.className = "status-msg";

  try {
    const body = {
      storeName: $("#storeNameInput").value.trim(),
      whatsappNumber: $("#whatsappNumberInput").value.trim()
    };
    await api("/api/admin/settings", { method: "POST", body: JSON.stringify(body) });
    msg.textContent = "✅ Данные магазина обновлены!";
    msg.className = "status-msg success";
    toast("Данные магазина сохранены");
  } catch (err) {
    msg.textContent = "❌ " + err.message;
    msg.className = "status-msg error";
  }
};

// Password Change
$("#passwordForm").onsubmit = async e => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const msg = $("#passwordMessage");
  msg.textContent = "Обновление...";
  msg.className = "status-msg";

  try {
    await api("/api/admin/change-password", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(fd))
    });
    msg.textContent = "✅ Пароль успешно изменён!";
    msg.className = "status-msg success";
    e.target.reset();
    toast("Пароль обновлен");
  } catch (err) {
    msg.textContent = "❌ " + err.message;
    msg.className = "status-msg error";
  }
};

// Start
checkAuth();
