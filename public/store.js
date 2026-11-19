let products = [];
let cart = JSON.parse(localStorage.getItem("cabaniCartV3") || "[]");
let category = "all";
let search = "";
let selectedProduct = null;
let selectedSize = null;

const $ = s => document.querySelector(s);
const money = n => new Intl.NumberFormat("ru-RU").format(n) + " сум";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[c]));

const FALLBACK_PHOTO = "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=700&q=85";

function imageSrc(s) {
  const v = String(s || "").trim();
  if (v.startsWith("data:image/") || /^https?:\/\//i.test(v) || v.startsWith("/uploads/")) {
    return esc(v);
  }
  return FALLBACK_PHOTO;
}

async function api(url, opts = {}) {
  const r = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts
  });
  let d = {};
  try { d = await r.json(); } catch {}
  if (!r.ok) throw new Error(d.error || "Ошибка запроса");
  return d;
}

function notify(t) {
  const toast = $("#toast");
  toast.textContent = t;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2800);
}

function render() {
  const list = products.filter(p => {
    const matchCat = category === "all" || p.category === category;
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
                        (p.description || "").toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const container = $("#products");
  if (!list.length) {
    container.innerHTML = `<div class="empty-state">По вашему запросу товары не найдены. Попробуйте сбросить фильтры.</div>`;
    return;
  }

  container.innerHTML = list.map(p => {
    const catMap = { shoes: "Обувь", clothing: "Одежда", accessories: "Аксессуары" };
    const hasDiscount = p.old_price && p.old_price > p.price;
    const discountPct = hasDiscount ? Math.round((1 - p.price / p.old_price) * 100) : 0;

    return `
      <article class="card" data-id="${p.id}">
        <div class="photo">
          <img src="${imageSrc(p.image)}" alt="${esc(p.name)}" loading="lazy">
          <span class="tag">CABANI</span>
          ${hasDiscount ? `<span class="sale-badge">-${discountPct}%</span>` : ""}
        </div>
        <div class="meta">
          <div>
            <span class="card-cat">${catMap[p.category] || p.category}</span>
            <strong class="card-title">${esc(p.name)}</strong>
          </div>
          <div class="card-pricing">
            <span class="price">${money(p.price)}</span>
            ${hasDiscount ? `<del class="old-price">${money(p.old_price)}</del>` : ""}
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function saveCart() {
  localStorage.setItem("cabaniCartV3", JSON.stringify(cart));
  const count = cart.reduce((s, x) => s + x.qty, 0);
  $("#count").textContent = count;
  renderCart();
}

function getCartTotal() {
  return cart.reduce((sum, item) => {
    const p = products.find(x => x.id === item.productId);
    return sum + (p ? p.price * item.qty : 0);
  }, 0);
}

function renderCart() {
  const container = $("#cartItems");
  if (!cart.length) {
    container.innerHTML = `<div class="cart-empty"><p>Ваша корзина пуста.</p><small class="muted">Перейдите в каталог, чтобы выбрать понравившуюся пару.</small></div>`;
    $("#total").textContent = "0 сум";
    return;
  }

  container.innerHTML = cart.map((item, index) => {
    const p = products.find(x => x.id === item.productId);
    if (!p) return "";
    return `
      <div class="cartline">
        <img src="${imageSrc(p.image)}" alt="${esc(p.name)}">
        <div class="cartline-info">
          <b>${esc(p.name)}</b>
          <span class="cartline-size">Размер: <b>${esc(item.size)}</b></span>
          <div class="cartline-price">${money(p.price * item.qty)}</div>
          <div class="cartline-ctrls">
            <button class="qty-btn" data-dec="${index}">−</button>
            <span class="qty-num">${item.qty}</span>
            <button class="qty-btn" data-inc="${index}">+</button>
            <button class="del-btn" data-del="${index}">✕</button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  $("#total").textContent = money(getCartTotal());
}

function openCart() {
  $("#drawer").classList.add("open");
  $("#shade").classList.add("show");
}

function closeCart() {
  $("#drawer").classList.remove("open");
  $("#shade").classList.remove("show");
}

function openProductModal(id) {
  selectedProduct = products.find(p => p.id === id);
  if (!selectedProduct) return;

  const sizes = Array.isArray(selectedProduct.sizes) ? selectedProduct.sizes : [];
  selectedSize = sizes[0] || "Стандарт";

  const catMap = { shoes: "Обувь", clothing: "Одежда", accessories: "Аксессуары" };
  const hasDiscount = selectedProduct.old_price && selectedProduct.old_price > selectedProduct.price;
  const discountPct = hasDiscount ? Math.round((1 - selectedProduct.price / selectedProduct.old_price) * 100) : 0;

  $("#productDetails").innerHTML = `
    <div class="detail">
      <div class="detail-img-wrap">
        <img src="${imageSrc(selectedProduct.image)}" alt="${esc(selectedProduct.name)}">
        ${hasDiscount ? `<span class="detail-badge">СКИДКА -${discountPct}%</span>` : ""}
      </div>
      <div class="detail-content">
        <small class="detail-cat">${catMap[selectedProduct.category] || selectedProduct.category} · CABANI OUTLET</small>
        <h2>${esc(selectedProduct.name)}</h2>
        
        <div class="detail-price-box">
          <strong class="detail-price">${money(selectedProduct.price)}</strong>
          ${hasDiscount ? `<del class="detail-old-price">${money(selectedProduct.old_price)}</del>` : ""}
        </div>

        <p class="detail-desc">${esc(selectedProduct.description || "Оригинальная модель из коллекции CABANI. Натуральные материалы, идеальная посадка и максимальный комфорт.")}</p>

        <div class="size-selection">
          <div class="size-head">
            <span>Выберите размер:</span>
            <small class="muted">${selectedProduct.category === 'shoes' ? 'EU размеры' : ''}</small>
          </div>
          <div class="sizes">
            ${sizes.map((s, i) => `
              <button class="size-btn ${i === 0 ? 'sel' : ''}" data-size="${esc(s)}">${esc(s)}</button>
            `).join("")}
          </div>
        </div>

        <button class="cta add-to-cart-btn" id="addToCartBtn">
          ДОБАВИТЬ В КОРЗИНУ · ${money(selectedProduct.price)}
        </button>
      </div>
    </div>
  `;

  $("#productModal").classList.add("show");
  $("#modalShade").classList.add("show");
}

function closeProductModal() {
  $("#productModal").classList.remove("show");
  $("#modalShade").classList.remove("show");
}

// Event Listeners
$("#products").onclick = e => {
  const card = e.target.closest("[data-id]");
  if (card) openProductModal(Number(card.dataset.id));
};

document.querySelectorAll(".filter-btn").forEach(b => {
  b.onclick = () => {
    category = b.dataset.cat;
    document.querySelectorAll(".filter-btn").forEach(x => x.classList.toggle("active", x === b));
    render();
  };
});

$("#search").oninput = e => {
  search = e.target.value.trim();
  render();
};

$("#productDetails").onclick = e => {
  const sizeBtn = e.target.closest("[data-size]");
  if (sizeBtn) {
    selectedSize = sizeBtn.dataset.size;
    document.querySelectorAll(".size-btn").forEach(x => x.classList.toggle("sel", x === sizeBtn));
  }

  if (e.target.id === "addToCartBtn" || e.target.closest("#addToCartBtn")) {
    const existing = cart.find(x => x.productId === selectedProduct.id && x.size === selectedSize);
    if (existing) {
      existing.qty++;
    } else {
      cart.push({ productId: selectedProduct.id, size: selectedSize, qty: 1 });
    }
    saveCart();
    closeProductModal();
    notify(`«${selectedProduct.name}» (Размер: ${selectedSize}) добавлен в корзину!`);
    openCart();
  }
};

$("#cartOpen").onclick = openCart;
$("#cartClose").onclick = closeCart;
$("#shade").onclick = closeCart;
$("#productClose").onclick = closeProductModal;
$("#modalShade").onclick = () => {
  closeProductModal();
  $("#checkoutModal").classList.remove("show");
  $("#successModal").classList.remove("show");
};

$("#cartItems").onclick = e => {
  const inc = e.target.closest("[data-inc]");
  const dec = e.target.closest("[data-dec]");
  const del = e.target.closest("[data-del]");

  if (inc) {
    cart[Number(inc.dataset.inc)].qty++;
    saveCart();
  } else if (dec) {
    const idx = Number(dec.dataset.dec);
    cart[idx].qty--;
    if (cart[idx].qty <= 0) cart.splice(idx, 1);
    saveCart();
  } else if (del) {
    cart.splice(Number(del.dataset.del), 1);
    saveCart();
  }
};

$("#checkout").onclick = () => {
  if (!cart.length) return notify("Ваша корзина пуста");
  $("#checkoutTotal").textContent = money(getCartTotal());
  $("#checkoutModal").classList.add("show");
  $("#modalShade").classList.add("show");
  closeCart();
};

$("#checkoutClose").onclick = () => {
  $("#checkoutModal").classList.remove("show");
  $("#modalShade").classList.remove("show");
};

$("#checkoutForm").onsubmit = async e => {
  e.preventDefault();
  const f = new FormData(e.target);
  const btn = $("#submitOrderBtn");
  btn.disabled = true;
  btn.textContent = "Отправка заказа...";

  try {
    const result = await api("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        name: f.get("name"),
        phone: f.get("phone"),
        address: f.get("address"),
        comment: f.get("comment"),
        items: cart
      })
    });

    cart = [];
    saveCart();
    $("#checkoutModal").classList.remove("show");
    e.target.reset();

    $("#successMessage").innerHTML = `
      Ваш заказ <b>#${result.orderId}</b> успешно принят!<br>
      Сумма к оплате: <b>${money(result.total)}</b>.<br>
      Мы отправили уведомление в отдел доставки и свяжемся с вами в течение нескольких минут.
    `;
    $("#successModal").classList.add("show");
  } catch (err) {
    notify(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "ПОДТВЕРДИТЬ И ОТПРАВИТЬ ЗАКАЗ";
  }
};

$("#successCloseBtn").onclick = () => {
  $("#successModal").classList.remove("show");
  $("#modalShade").classList.remove("show");
};

// Initial Load
(async () => {
  try {
    const d = await api("/api/store");
    products = d.products || [];
    if (d.storeName) document.title = `${d.storeName} — Официальный магазин`;
    if (d.whatsappNumber) {
      const cleanWa = d.whatsappNumber.replace(/[^\d]/g, "");
      $("#footerPhone").innerHTML = `📞 Телефон: <a href="tel:+${cleanWa}" style="color:#eee; text-decoration:none;">+${cleanWa}</a> · <a href="https://wa.me/${cleanWa}" target="_blank" style="color:#25d366; text-decoration:none; font-weight:700;">WhatsApp</a>`;
    }
    render();
    saveCart();
  } catch (e) {
    console.error("Store init error:", e);
    $("#products").innerHTML = "<div class='empty-state'>Не удалось загрузить каталог. Пожалуйста, обновите страницу.</div>";
  }
})();
