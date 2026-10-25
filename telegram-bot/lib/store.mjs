/**
 * Tiny persistent JSON store — zero-dependency, atomic writes (tmp + rename).
 *
 * Collections (files under telegram-bot/data/, git-ignored):
 *   users.json        Telegram users: tgUserId, phone, verifiedAt, pending flows
 *   products.json     Sellable products (digital delivery payloads)
 *   orders.json       Purchase orders (receipt review, approve/reject)
 *   deliveries.json   What was delivered to whom, when, and how
 *   logs.json         Audit trail of important events
 *
 * The store is intentionally simple (fine for hundreds of customers). It can be
 * swapped for SQLite/D1 later without touching the bot logic in flow.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';

export function createStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const fileFor = (name) => path.join(dataDir, `${name}.json`);

  const read = (name, fallback) => {
    try {
      if (fs.existsSync(fileFor(name))) return JSON.parse(fs.readFileSync(fileFor(name), 'utf-8'));
    } catch {
      /* corrupted file — start from fallback */
    }
    return fallback;
  };

  const write = (name, value) => {
    const target = fileFor(name);
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf-8');
    fs.renameSync(tmp, target); // atomic on POSIX
  };

  return {
    dataDir,
    read,
    write,

    /* ---------------- users ---------------- */
    allUsers: () => read('users', []),
    getUser(tgUserId) {
      return this.allUsers().find((u) => u.tgUserId === String(tgUserId)) || null;
    },
    upsertUser(tgUserId, patch = {}) {
      const users = this.allUsers();
      const idx = users.findIndex((u) => u.tgUserId === String(tgUserId));
      const base = idx >= 0 ? users[idx] : { tgUserId: String(tgUserId), createdAt: new Date().toISOString() };
      const next = { ...base, ...patch, tgUserId: String(tgUserId), updatedAt: new Date().toISOString() };
      if (idx >= 0) users[idx] = next;
      else users.push(next);
      write('users', users);
      return next;
    },
    /** Verified user linked to this phone (website account match). */
    findUserByPhone(phone) {
      return this.allUsers().find((u) => u.phone === phone && u.verifiedAt) || null;
    },

    /* ---------------- products ---------------- */
    allProducts: () => read('products', []),
    getProduct(id) {
      return this.allProducts().find((p) => p.id === String(id)) || null;
    },
    upsertProduct(product) {
      const products = this.allProducts();
      const idx = products.findIndex((p) => p.id === product.id);
      if (idx >= 0) products[idx] = { ...products[idx], ...product };
      else products.push(product);
      write('products', products);
      return product;
    },

    /* ---------------- orders ---------------- */
    allOrders: () => read('orders', []),
    getOrder(id) {
      return this.allOrders().find((o) => o.id === String(id)) || null;
    },
    addOrder(order) {
      const orders = this.allOrders();
      orders.unshift(order);
      write('orders', orders.slice(0, 2000));
      return order;
    },
    updateOrder(id, patch) {
      const orders = this.allOrders();
      const idx = orders.findIndex((o) => o.id === String(id));
      if (idx < 0) return null;
      orders[idx] = { ...orders[idx], ...patch, updatedAt: new Date().toISOString() };
      write('orders', orders);
      return orders[idx];
    },
    ordersOf(tgUserId) {
      return this.allOrders().filter((o) => o.tgUserId === String(tgUserId));
    },
    pendingOrders() {
      return this.allOrders().filter((o) => o.status === 'pending');
    },

    /* ---------------- deliveries ---------------- */
    allDeliveries: () => read('deliveries', []),
    addDelivery(delivery) {
      const deliveries = this.allDeliveries();
      deliveries.unshift(delivery);
      write('deliveries', deliveries.slice(0, 2000));
      return delivery;
    },
    updateDelivery(id, patch) {
      const deliveries = this.allDeliveries();
      const idx = deliveries.findIndex((d) => d.id === String(id));
      if (idx < 0) return null;
      deliveries[idx] = { ...deliveries[idx], ...patch, updatedAt: new Date().toISOString() };
      write('deliveries', deliveries);
      return deliveries[idx];
    },
    deliveriesOf(tgUserId) {
      return this.allDeliveries().filter((d) => d.tgUserId === String(tgUserId));
    },
    queuedDeliveries(tgUserId) {
      return this.allDeliveries().filter((d) => d.tgUserId === String(tgUserId) && d.status === 'queued');
    },

    /* ---------------- audit log ---------------- */
    log(event, detail = '') {
      const logs = read('logs', []);
      logs.unshift({ id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, event, detail: String(detail).slice(0, 500), at: new Date().toISOString() });
      write('logs', logs.slice(0, 1000));
    },
  };
}
