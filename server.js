require('dotenv').config();
const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("./models/User");
const Conversation = require("./models/Conversation");
const bodyParser = require("body-parser");
const cors = require("cors");
const fs = require("fs");
const { makeWASocket, Browsers, useMultiFileAuthState, DisconnectReason, fetchLatestWaWebVersion } = require("baileys");

require('./database.js');
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.json());
app.use(express.static("public"));
const JWT_SECRET = "chave123";

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

async function getProfilePicture(jid, name, isGroup = false) {
  if (isGroup) {
    // Grupos: usa avatar com letras
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
  }

  try {
    const url = await sock.profilePictureUrl(jid, "image");
    return url;
  } catch (err) {
    console.log(`Não conseguiu pegar foto de ${jid}: ${err.message}`);
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`;
  }
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

      // Só busca foto se for contato individual
      const isGroup = jid.endsWith("@g.us");

      // Busca conversa no MongoDB
      let conv = await Conversation.findOne({ jid });
      if (!conv) {
        conv = new Conversation({
          jid,
          name,
          img: "", // será atualizado abaixo
          status: "queue",
          messages: [],
        });
      } else if (conv.status === "closed") {
        conv.status = "queue";
      }

      // Atualiza imagem do perfil
      if (!conv.img || conv.img === "") {
        conv.img = await getProfilePicture(jid, name, isGroup);
      }

      // Adiciona a nova mensagem
      conv.messages.push({
        text,
        fromMe: msg.key.fromMe,
        timestamp,
        messageId: msg.key.id,
      });

      await conv.save();
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

const authMiddleware = (req, res, next) => {
  const token = req.headers["authorization"];
  if (!token) return res.status(401).json({ error: "Token não fornecido" });

  try {
    const decoded = jwt.verify(token.replace("Bearer ", ""), JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido" });
  }
};

// ===== Endpoints =====
app.post("/register", async (req, res) => {
  try {
    const { username, number, password, role } = req.body;
    const user = new User({ username, number, password, role });
    await user.save();
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});
app.post("/login", async (req, res) => {
  const { username, number, password } = req.body;
  const user = await User.findOne({ number });
  if (!user) return res.json({ success: false, error: "Usuário não encontrado" });

  const isMatch = await user.comparePassword(password);
  if (!isMatch) return res.json({ success: false, error: "Senha incorreta" });

  // Criar token JWT
  const token = jwt.sign({ id: user._id, number: user.number }, JWT_SECRET, { expiresIn: "365d" });
  res.json({ success: true, token, number: user.number });
});
app.get("/", authMiddleware, (req, res) => {
  window.location.href = "/index.html"
});
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
app.get("/update-profile-picture/:jid", authMiddleware, async (req, res) => {
  const jid = req.params.jid;
  try {
    let img;
    try {
      img = await sock.profilePictureUrl(jid, "image");
    } catch {
      img = `https://ui-avatars.com/api/?name=${encodeURIComponent(jid)}&background=random`;
    }

    // Atualiza no MongoDB também
    const conv = await Conversation.findOne({ jid });
    if (conv) {
      conv.img = img;
      await conv.save();
    }

    res.json({ img });
  } catch (err) {
    console.error("Erro ao pegar foto do WhatsApp:", err);
    res.status(500).json({ img: `https://ui-avatars.com/api/?name=${encodeURIComponent(jid)}&background=random` });
  }
});
app.get("/conversations", authMiddleware, async (req, res) => {
  const allConvs = await Conversation.find();
  res.json(allConvs);
});
app.get("/conversations/:jid", authMiddleware, async (req, res) => {
  const conv = await Conversation.findOne({ jid: req.params.jid });
  if (!conv) return res.status(404).json({ error: "Conversa não encontrada" });
  res.json(conv);
});
app.post("/conversations/:jid/status", authMiddleware, async (req, res) => {
  const { status } = req.body;
  const conv = await Conversation.findOne({ jid: req.params.jid });
  if (!conv) return res.status(404).json({ error: "Conversa não encontrada" });
  conv.status = status;
  await conv.save();
  res.json({ success: true });
});
app.post("/send", authMiddleware, async (req, res) => {
  const { jid, text } = req.body;
  if (!sock || lastStatus !== "conectado") return res.status(400).json({ error: "Bot não está conectado." });

  await sock.sendMessage(jid, { text });

  let conv = await Conversation.findOne({ jid });
  if (!conv) {
    conv = new Conversation({ jid, name: "", messages: [], status: "queue" });
  }

  conv.messages.push({
    text,
    fromMe: true,
    timestamp: Date.now(),
    messageId: Date.now().toString(),
  });

  await conv.save();

  res.json({ success: true });
});

// ===== Inicializa =====
createTestConversations();
initWASocket();
app.listen(3000, () => console.log("API rodando em http://localhost:3000"));
