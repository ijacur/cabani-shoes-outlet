const http = require("http");
const assert = require("assert");
const app = require("../server");

let server;
let port;
let adminCookie = "";

function request(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const reqHeaders = {
      ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
      ...(adminCookie ? { "Cookie": adminCookie } : {}),
      ...headers
    };

    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path,
      method,
      headers: reqHeaders
    }, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(data); } catch {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: json || data
        });
      });
    });

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log("=== STARTING CABANI SHOES OUTLET AUTOMATED TESTS ===");

  server = app.listen(0);
  port = server.address().port;

  try {
    // 1. Healthz
    console.log("1. Testing GET /healthz...");
    const health = await request("GET", "/healthz");
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.data.ok, true);
    console.log("✓ /healthz passed");

    // 2. Public Store
    console.log("2. Testing GET /api/store...");
    const store = await request("GET", "/api/store");
    assert.strictEqual(store.status, 200);
    assert.ok(Array.isArray(store.data.products));
    assert.ok(store.data.products.length > 0);
    console.log(`✓ /api/store passed (${store.data.products.length} products loaded)`);

    // 3. Create Order
    console.log("3. Testing POST /api/orders...");
    const testItem = store.data.products[0];
    const orderRes = await request("POST", "/api/orders", {
      name: "Тестовый Покупатель",
      phone: "+998901234567",
      address: "г. Ташкент, ул. Навои 1",
      comment: "Срочная доставка",
      items: [
        { productId: testItem.id, size: "42", qty: 1 }
      ]
    });
    assert.strictEqual(orderRes.status, 201);
    assert.ok(orderRes.data.orderId > 0);
    assert.strictEqual(orderRes.data.total, testItem.price);
    console.log(`✓ Order creation passed (Order #${orderRes.data.orderId}, total: ${orderRes.data.total} сум)`);

    // 4. Admin Login (Bad Password)
    console.log("4. Testing Admin Login with incorrect password...");
    const badLogin = await request("POST", "/api/admin/login", {
      username: "admin",
      password: "wrongpassword"
    });
    assert.strictEqual(badLogin.status, 401);
    console.log("✓ Invalid password rejected");

    // 5. Admin Login (Correct Password)
    console.log("5. Testing Admin Login with valid credentials...");
    const goodLogin = await request("POST", "/api/admin/login", {
      username: "admin",
      password: "Cabani2026!"
    });
    assert.strictEqual(goodLogin.status, 200);
    assert.strictEqual(goodLogin.data.ok, true);
    const setCookie = goodLogin.headers["set-cookie"];
    assert.ok(setCookie);
    adminCookie = setCookie[0].split(";")[0];
    console.log("✓ Admin authentication passed, session cookie established");

    // 6. Admin Me
    console.log("6. Testing GET /api/admin/me...");
    const me = await request("GET", "/api/admin/me");
    assert.strictEqual(me.status, 200);
    assert.strictEqual(me.data.username, "admin");
    console.log("✓ /api/admin/me verified");

    // 7. Admin Products CRUD
    console.log("7. Testing Admin Product CRUD...");
    const createProd = await request("POST", "/api/admin/products", {
      name: "Тестовые Мокасины CABANI",
      category: "shoes",
      price: 650000,
      old_price: 850000,
      sizes: ["41", "42", "43"],
      description: "Тестовая модель",
      image: "https://example.com/shoe.jpg",
      active: 1
    });
    assert.strictEqual(createProd.status, 201);
    const newProdId = createProd.data.id;
    assert.ok(newProdId > 0);

    const updateProd = await request("PUT", `/api/admin/products/${newProdId}`, {
      price: 690000
    });
    assert.strictEqual(updateProd.status, 200);
    assert.strictEqual(updateProd.data.price, 690000);

    const deleteProd = await request("DELETE", `/api/admin/products/${newProdId}`);
    assert.strictEqual(deleteProd.status, 200);
    assert.strictEqual(deleteProd.data.ok, true);
    console.log("✓ Product Create, Update, and Delete verified");

    // 8. Admin Orders & Status Patch
    console.log("8. Testing Admin Orders & Status Patch...");
    const ordersRes = await request("GET", "/api/admin/orders");
    assert.strictEqual(ordersRes.status, 200);
    assert.ok(Array.isArray(ordersRes.data));
    assert.ok(ordersRes.data.length > 0);

    const lastOrder = ordersRes.data[0];
    const patchStatus = await request("PATCH", `/api/admin/orders/${lastOrder.id}`, {
      status: "confirmed"
    });
    assert.strictEqual(patchStatus.status, 200);
    assert.strictEqual(patchStatus.data.status, "confirmed");
    console.log("✓ Admin Order list and status update verified");

    // 9. Admin Stats
    console.log("9. Testing GET /api/admin/stats...");
    const stats = await request("GET", "/api/admin/stats");
    assert.strictEqual(stats.status, 200);
    assert.ok(stats.data.products > 0);
    assert.ok(stats.data.orders > 0);
    console.log("✓ Admin stats calculated correctly");

    // 10. Admin Settings
    console.log("10. Testing Admin Settings...");
    const settings = await request("POST", "/api/admin/settings", {
      storeName: "CABANI SHOES OUTLET",
      whatsappNumber: "998901234567"
    });
    assert.strictEqual(settings.status, 200);
    assert.strictEqual(settings.data.settings.storeName, "CABANI SHOES OUTLET");
    console.log("✓ Admin settings verified");

    console.log("\n========================================================");
    console.log("🎉 ALL CABANI SHOES OUTLET TESTS PASSED SUCCESSFULLY! 🎉");
    console.log("========================================================");
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
