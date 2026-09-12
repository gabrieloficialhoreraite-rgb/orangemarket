const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "TROQUE-ESTA-SENHA";
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const SELLER_EMAIL = process.env.SELLER_EMAIL || "gabrieloficialhoreraite@gmail.com";

const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
const mailer = smtpConfigured ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
}) : null;

const dataDir = path.join(__dirname, "data");
const ordersFile = path.join(dataDir, "orders.json");
fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(ordersFile)) fs.writeFileSync(ordersFile, "[]", "utf8");

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false }));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use("/api/", apiLimiter);

function readOrders() {
  try { return JSON.parse(fs.readFileSync(ordersFile, "utf8")); }
  catch { return []; }
}
function writeOrders(orders) {
  fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2), "utf8");
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function makeToken() {
  const payload = `${ADMIN_USER}:${Date.now()}`;
  const sig = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}
function validToken(token) {
  try {
    const raw = Buffer.from(token, "base64url").toString();
    const parts = raw.split(":");
    if (parts.length < 3 || parts[0] !== ADMIN_USER) return false;
    const sig = parts.pop();
    const payload = parts.join(":");
    return safeEqual(sig, crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("hex"));
  } catch { return false; }
}
function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token || !validToken(token)) return res.status(401).json({ error: "Não autorizado" });
  next();
}

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body || {};
  if (safeEqual(username, ADMIN_USER) && safeEqual(password, ADMIN_PASSWORD)) {
    return res.json({ token: makeToken() });
  }
  res.status(401).json({ error: "Usuário ou senha inválidos" });
});

app.post("/api/orders", (req, res) => {
  const b = req.body || {};
  const required = ["nome","cpf","nascimento","email","telefone","cep","numero","rua","bairro","cidade","estado","cart","total"];
  if (required.some(k => b[k] === undefined || b[k] === "")) {
    return res.status(400).json({ error: "Dados obrigatórios ausentes" });
  }
  if (!Array.isArray(b.cart) || !b.cart.length) return res.status(400).json({ error: "Carrinho vazio" });
  if (b.consent !== "on" && b.consent !== true && b.consent !== "true") return res.status(400).json({ error: "Consentimento necessário" });

  const order = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: "Novo",
    nome: String(b.nome).slice(0,120),
    cpf: String(b.cpf).slice(0,14),
    nascimento: String(b.nascimento).slice(0,10),
    email: String(b.email).slice(0,160),
    telefone: String(b.telefone).slice(0,30),
    endereco: {
      cep: String(b.cep).slice(0,9),
      rua: String(b.rua).slice(0,160),
      numero: String(b.numero).slice(0,30),
      bairro: String(b.bairro).slice(0,100),
      complemento: String(b.complemento || "").slice(0,100),
      cidade: String(b.cidade).slice(0,100),
      estado: String(b.estado).slice(0,30)
    },
    cart: b.cart.map(x => ({
      id: x.id, produto: String(x.produto).slice(0,160),
      quantidade: Number(x.quantidade) || 1, preco: Number(x.preco) || 0
    })),
    total: Number(b.total) || 0
  };

  const orders = readOrders();
  orders.unshift(order);
  writeOrders(orders);

  if (mailer) {
    const items = order.cart.map(x => `- ${x.produto} | qtd: ${x.quantidade} | R$ ${x.preco.toFixed(2)}`).join("\n");
    const text = [
      `Novo pedido: ${order.id}`,
      `Data: ${order.createdAt}`,
      `Status: ${order.status}`,
      "",
      "COMPRADOR",
      `Nome: ${order.nome}`,
      `CPF: ${order.cpf}`,
      `Nascimento: ${order.nascimento}`,
      `E-mail: ${order.email}`,
      `Telefone: ${order.telefone}`,
      "",
      "ENDEREÇO",
      `CEP: ${order.endereco.cep}`,
      `Rua: ${order.endereco.rua}, ${order.endereco.numero}`,
      `Bairro: ${order.endereco.bairro}`,
      `Complemento: ${order.endereco.complemento || "-"}`,
      `Cidade/UF: ${order.endereco.cidade} - ${order.endereco.estado}`,
      "",
      "PRODUTOS",
      items,
      "",
      `TOTAL: R$ ${order.total.toFixed(2)}`
    ].join("\n");

    try {
      await mailer.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: SELLER_EMAIL,
        subject: `Novo pedido OrangeMarket #${order.id.slice(0, 8)}`,
        text
      });
    } catch (err) {
      console.error("Pedido salvo, mas o e-mail não foi enviado:", err.message);
      return res.status(201).json({ ok: true, orderId: order.id, emailSent: false });
    }
  } else {
    console.warn("SMTP não configurado. Pedido salvo no painel, mas nenhum e-mail foi enviado.");
  }

  res.status(201).json({ ok: true, orderId: order.id, emailSent: Boolean(mailer) });
});

app.get("/api/orders", auth, (req, res) => {
  res.json(readOrders());
});

app.patch("/api/orders/:id", auth, (req, res) => {
  const orders = readOrders();
  const order = orders.find(x => x.id === req.params.id);
  if (!order) return res.status(404).json({ error: "Pedido não encontrado" });
  const allowed = ["Novo","Pago","Enviado","Concluído","Cancelado"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "Status inválido" });
  order.status = req.body.status;
  writeOrders(orders);
  res.json({ ok: true });
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"));
});

app.listen(PORT, () => console.log(`OrangeMarket servidor: http://localhost:${PORT}`));
