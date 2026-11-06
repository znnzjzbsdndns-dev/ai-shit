// server.js - navegador remoto para o modo Live do DexSearch
// Instalar: npm i express puppeteer
// Rodar:    KEY=minha-chave node server.js
const express = require("express");
const puppeteer = require("puppeteer");

const KEY = process.env.KEY || "troque-esta-chave";
const PORT = process.env.PORT || 3000;
const app = express();
const sessions = new Map();
let browser;

async function getBrowser() {
  if (!browser) {
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }
  return browser;
}

const pageOf = (id) => sessions.get(id);

app.use((req, res, next) => {
  if (req.query.key !== KEY) return res.status(403).send("no");
  next();
});

app.get("/ping", (q, r) => r.send("pong"));

app.get("/open", async (req, res) => {
  try {
    const w = +req.query.w || 800;
    const h = +req.query.h || 500;
    let p = pageOf(req.query.id);
    if (!p) {
      p = await (await getBrowser()).newPage();
      sessions.set(req.query.id, p);
    }
    await p.setViewport({ width: w, height: h });
    await p.goto(req.query.url, { waitUntil: "domcontentloaded", timeout: 25000 }).catch(() => {});
    res.json({ ok: true, w, h, url: p.url(), title: await p.title() });
  } catch (e) {
    res.json({ ok: false, error: String(e.message || e) });
  }
});

app.get("/shot", async (req, res) => {
  try {
    const p = pageOf(req.query.id);
    if (!p) return res.status(404).end();
    const buf = await p.screenshot({ type: "jpeg", quality: 45 });
    res.type("image/jpeg").send(buf);
  } catch (e) {
    res.status(500).end();
  }
});

app.get("/info", async (req, res) => {
  try {
    const p = pageOf(req.query.id);
    if (!p) return res.json({ ok: false });
    const editable = await p
      .evaluate(() => {
        const a = document.activeElement;
        if (!a) return false;
        if (a.isContentEditable || a.tagName === "TEXTAREA") return true;
        return a.tagName === "INPUT" && !["button", "checkbox", "radio", "submit", "image"].includes(a.type);
      })
      .catch(() => false);
    res.json({ ok: true, url: p.url(), title: await p.title(), editable });
  } catch (e) {
    res.json({ ok: false });
  }
});

// comandos: sempre respondem "ok" (o script Lua ignora o corpo, mas não pode ser vazio)
const cmd = (path, fn) =>
  app.get(path, async (req, res) => {
    try {
      const p = pageOf(req.query.id);
      if (p) await fn(p, req.query);
    } catch (e) {}
    res.send("ok");
  });

cmd("/click", (p, q) => p.mouse.click(+q.x, +q.y));
cmd("/scroll", (p, q) => p.mouse.wheel({ deltaY: +q.dy }));
cmd("/type", (p, q) => p.keyboard.type(q.text));
cmd("/key", async (p, q) => {
  for (let i = 0; i < (+q.n || 1); i++) await p.keyboard.press(q.key);
});
cmd("/back", (p) => p.goBack({ timeout: 10000 }));
cmd("/close", async (p, q) => {
  sessions.delete(q.id);
  await p.close();
});

app.listen(PORT, () => console.log("DexSearch live server na porta " + PORT));
