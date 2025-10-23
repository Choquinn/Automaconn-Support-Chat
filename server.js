const express = require("express");
const cors = require("cors");
const fs = require("fs");
const { makeWASocket, Browsers, useMultiFileAuthState, DisconnectReason, fetchLatestWaWebVersion } = require("baileys");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

let sock; 
let lastQR = null;
let lastStatus = "desconectado";

// Armazena mensagens e conversas
let conversations = {};

// ===== Popula conversas de teste =====
function createTestConversations() {
  conversations = {
    "5511999999991@s.whatsapp.net": {
      jid: "5511999999991@s.whatsapp.net",
      name: "João",
      img: "https://i.pravatar.cc/150?img=1",
      status: "queue",
      messages: [
        { id: "1", text: "Olá!", fromMe: false, timestamp: Date.now() - 60000 },
        { id: "2", text: "Oi, tudo bem?", fromMe: true, timestamp: Date.now() - 50000 },
      ]
    },
    "5511999999992@s.whatsapp.net": {
      jid: "5511999999992@s.whatsapp.net",
      name: "Maria",
      img: "https://i.pravatar.cc/150?img=2",
      status: "active",
      messages: [
        { id: "1", text: "Bom dia!", fromMe: false, timestamp: Date.now() - 120000 },
        { id: "2", text: "Bom dia, como posso ajudar?", fromMe: true, timestamp: Date.now() - 90000 },
      ]
    },
    "5511999999993@s.whatsapp.net": {
      jid: "5511999999993@s.whatsapp.net",
      name: "Carlos",
      img: "https://i.pravatar.cc/150?img=3",
      status: "closed",
      messages: [
        { id: "1", text: "Preciso de suporte.", fromMe: false, timestamp: Date.now() - 180000 },
        { id: "2", text: "Resolvido, obrigado!", fromMe: true, timestamp: Date.now() - 170000 },
      ]
    },
  };
}

// ===== Inicializa conexão com WhatsApp =====
const initWASocket = async () => {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestWaWebVersion({});

  sock = makeWASocket({
    auth: state,
    browser: Browsers.appropriate("Desktop"),
    printQRInTerminal: false,
    version,
  });

  sock.ev.on("connection.update", ({ connection, qr, lastDisconnect }) => {
    if (qr) lastQR = qr;

    switch (connection) {
      case "open":
        lastStatus = "conectado";
        console.log("Bot conectado!");
        break;
      case "close":
        lastStatus = "desconectado";
        const shouldReconnect =
          (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) setTimeout(initWASocket, 5000);
        break;
    }
  });

  sock.ev.on("messages.upsert", async ({ messages: newMessages }) => {
    for (const msg of newMessages) {
      const jid = msg.key.remoteJid;
      const name = msg.pushName || "Usuário";
      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
      const timestamp = msg.messageTimestamp?.low ? msg.messageTimestamp.low * 1000 : Date.now();

      if (!text) continue;

      if (!conversations[jid]) {
        conversations[jid] = {
          jid,
          name,
          img: "",
          status: "queue",
          messages: []
        };
      } else if (conversations[jid].status === "closed") {
        conversations[jid].status = "queue";
      }

      conversations[jid].messages.push({
        id: msg.key.id,
        text,
        fromMe: msg.key.fromMe,
        timestamp
      });
    }
  });

  sock.ev.on("creds.update", saveCreds);
};

// ===== Endpoints =====
app.get("/status", (req, res) => res.json({ status: lastStatus }));
app.get("/qr", (req, res) => lastQR ? res.json({ qr: lastQR }) : res.status(404).send("QR ainda não gerado"));
app.get("/exit", async (req, res) => {
  fs.rmSync("./auth", { recursive: true, force: true });
  if (sock) await sock.logout().catch(() => {});
  sock = null;
  lastStatus = "desconectado";
  initWASocket();
  window.location.href = "/connect.html";
});
app.get("/conversations", (req, res) => res.json(Object.values(conversations)));
app.get("/conversations/:jid", (req, res) => {
  const conv = conversations[req.params.jid];
  if (!conv) return res.status(404).json({ error: "Conversa não encontrada" });
  res.json(conv);
});
app.post("/conversations/:jid/status", (req, res) => {
  const { status } = req.body;
  const conv = conversations[req.params.jid];
  if (!conv) return res.status(404).json({ error: "Conversa não encontrada" });
  conv.status = status;
  res.json({ success: true });
});
app.post("/send", async (req, res) => {
  const { jid, text } = req.body;
  if (!sock || lastStatus !== "conectado") return res.status(400).json({ error: "Bot não está conectado." });
  await sock.sendMessage(jid, { text });
  res.json({ success: true });
});

// ===== Inicializa =====
createTestConversations();
initWASocket();
app.listen(3000, () => console.log("API rodando em http://localhost:3000"));
