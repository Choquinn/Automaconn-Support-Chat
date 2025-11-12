//BACKEND
require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("./models/User");
const Conversation = require("./models/Conversation");
const Contact = require("./models/Contact");
const bodyParser = require("body-parser");
const cors = require("cors");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const {
  makeWASocket,
  Browsers,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestWaWebVersion,
  downloadContentFromMessage,
} = require("baileys");
const { v4: uuidv4 } = require("uuid");
const http = require("http");
const { Server } = require("socket.io");

const PROFILE_CACHE_DIR = path.join(__dirname, "public", "profile-pics");
const STICKER_DIR = path.join(__dirname, "public", "stickers");
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 horas

require("./database.js");

const app = express();
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(bodyParser.json());
app.use(express.json());
app.use(express.static("public"));
app.use("/media", express.static(path.join(__dirname, "media")));
app.use("/profile-pics", express.static(PROFILE_CACHE_DIR));
app.use(
  "/stickers",
  express.static(path.join(__dirname, "public", "stickers"))
);

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
let globalIO = io;

const JWT_SECRET = process.env.JWT_SECRET || "chave123";

let sock;
let lastQR = null;
let lastStatus = "desconectado";

// Cria diretório de cache se não existir
if (!fs.existsSync(PROFILE_CACHE_DIR)) {
  fs.mkdirSync(PROFILE_CACHE_DIR, { recursive: true });
}
if (!fs.existsSync(STICKER_DIR)) {
  fs.mkdirSync(STICKER_DIR, { recursive: true });
}

// ===== LIMPEZA DE IMAGENS EXPIRADAS =====
async function cleanExpiredProfilePics() {
  try {
    console.log("🧹 Limpando imagens expiradas no banco...");

    const conversations = await Conversation.find({
      img: { $regex: /^https:\/\/pps\.whatsapp\.net/ },
    });

    for (const conv of conversations) {
      const safeJid = conv.jid.replace(/[:\/\\]/g, "_");
      const fullLocalPath = path.join(PROFILE_CACHE_DIR, `${safeJid}.jpg`);

      if (fs.existsSync(fullLocalPath)) {
        conv.img = `/profile-pics/${encodeURIComponent(conv.jid)}.jpg`;
      } else {
        conv.img = `https://ui-avatars.com/api/?name=${encodeURIComponent(
          conv.name
        )}&background=random`;
      }

      await conv.save();
    }

    console.log(`✅ ${conversations.length} conversas atualizadas.`);
  } catch (err) {
    console.error("❌ Erro ao limpar imagens expiradas:", err);
  }
}

// ===== OBTER FOTO DE PERFIL =====
async function getProfilePicture(jid, name, isGroup = false) {
  if (isGroup) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(
      name
    )}&background=random`;
  }

  try {
    const url = await sock.profilePictureUrl(jid, "image");
    return url;
  } catch (err) {
    console.log(`Não conseguiu pegar foto de ${jid}: ${err.message}`);
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(
      name
    )}&background=random`;
  }
}

// ===== INICIALIZAÇÃO DO WHATSAPP =====
const initWASocket = async (ioInstance) => {
  const { state, saveCreds } = await useMultiFileAuthState("auth");
  const { version } = await fetchLatestWaWebVersion({});
  globalIO = ioInstance;

  sock = makeWASocket({
    auth: state,
    browser: Browsers.appropriate("Desktop"),
    printQRInTerminal: false,
    version,

    getMessage: async (key) => {
      const jid = key?.remoteJid || "";
      if (
        jid.endsWith("@g.us") ||
        jid === "status@broadcast" ||
        jid.endsWith("@newsletter")
      ) {
        return { conversation: "" };
      }
      return { conversation: "" };
    },
  });

  // ===== DESABILITA EVENTOS RELACIONADOS A GRUPOS OU STATUS (FEITO 1 VEZ) =====
  // CORREÇÃO: Estes eventos devem ser registrados aqui, uma única vez,
  // e não dentro do 'messages.upsert' onde seriam registrados a cada nova mensagem.
  sock.ev.on("groups.upsert", () => {}); // ignora novos grupos
  sock.ev.on("groups.update", () => {}); // ignora atualizações
  sock.ev.on("group-participants.update", () => {}); // ignora entradas/saídas
  sock.ev.on("chats.update", () => {}); // ignora atualizações de chats de grupo
  sock.ev.on("contacts.update", () => {}); // ainda pode receber contatos diretos

  // ===== TRATAMENTO DE ERROS DE SESSÃO =====
  // Isto evita logs de erro de "No session record" que ocorrem quando o WhatsApp reenvia mensagens
  sock.ev.on("error", (err) => {
    if (err?.message?.includes("No session record")) {
      console.log("⚠️ Ignorando erro de sessão (mensagem reenviada)");
      return; // Ignora erros de sessão faltante
    }
    console.error("❌ Erro do Socket:", err);
  });

  sock.ev.on(
    "connection.update",
    async ({ connection, qr, lastDisconnect, isNewLogin }) => {
      console.log("📡 Connection update:", { connection, isNewLogin });

      if (qr) {
        lastQR = qr;
        console.log("📱 QR Code gerado");
      }

      if (connection === "open") {
        lastStatus = "conectado";
        console.log("✅ Bot conectado!");
        console.log("📞 Número:", sock?.user?.id);
      }

      if (connection === "close") {
        const shouldReconnect =
          lastDisconnect?.error?.output?.statusCode !==
          DisconnectReason.loggedOut;
        const reason = lastDisconnect?.error?.output?.statusCode;
        const errorMsg = lastDisconnect?.error?.message;

        console.log("⚠️ Conexão fechada:");
        console.log("  - Status code:", reason);
        console.log("  - Mensagem:", errorMsg);
        console.log("  - Deve reconectar:", shouldReconnect);

        if (reason === DisconnectReason.badSession) {
          console.log("❌ Sessão inválida. Removendo auth...");
          fs.rmSync("./auth", { recursive: true, force: true });
          lastStatus = "desconectado";
          lastQR = null;
          console.log("🔄 Reiniciando em 3 segundos...");
          setTimeout(() => initWASocket(globalIO), 3000);
        } else if (reason === DisconnectReason.connectionClosed) {
          console.log("🔄 Conexão fechada. Reconectando...");
          lastStatus = "reconectando";
          setTimeout(() => initWASocket(globalIO), 3000);
        } else if (reason === DisconnectReason.connectionLost) {
          console.log("📡 Conexão perdida. Reconectando...");
          lastStatus = "reconectando";
          setTimeout(() => initWASocket(globalIO), 5000);
        } else if (reason === DisconnectReason.connectionReplaced) {
          console.log("🔁 Conexão substituída em outro lugar.");
          lastStatus = "desconectado";
        } else if (reason === DisconnectReason.loggedOut) {
          console.log("👋 Deslogado. Removendo sessão...");
          fs.rmSync("./auth", { recursive: true, force: true });
          lastStatus = "desconectado";
          lastQR = null; // Limpa QR antigo
          console.log("🔄 Iniciando nova sessão em 3 segundos...");
          setTimeout(() => initWASocket(globalIO), 3000);
        } else if (reason === DisconnectReason.restartRequired) {
          console.log("🔄 Restart necessário. Reconectando...");
          lastStatus = "reconectando";
          setTimeout(() => initWASocket(globalIO), 2000);
        } else if (reason === DisconnectReason.timedOut) {
          console.log("⏱️ Timeout. Reconectando...");
          lastStatus = "reconectando";
          setTimeout(() => initWASocket(globalIO), 5000);
        } else if (shouldReconnect) {
          console.log("🔄 Tentando reconectar...");
          lastStatus = "reconectando";
          setTimeout(() => initWASocket(globalIO), 5000);
        } else {
          lastStatus = "desconectado";
        }
      }
    }
  );

  sock.ev.on("messages.upsert", async ({ messages: newMessages }) => {
    for (const msg of newMessages) {
      try {
        const jid = msg.key.remoteJid;
        if (jid?.endsWith("@g.us")) continue;
        if (jid?.endsWith("@newsletter")) continue;
        if (jid === "status@broadcast") continue;
        if (!msg.message) continue;

        const messageId = msg.key.id;
        const text =
          msg.message?.conversation || msg.message?.extendedTextMessage?.text;
        const fromMe = msg.key.fromMe;

        if (!text) continue;

        let conv = await Conversation.findOne({ jid });
        if (!conv) {
          conv = new Conversation({
            jid,
            name: msg.pushName || "Usuário",
            status: "queue",
            messages: [],
          });
        }

        // ✅ Ignora mensagens fromMe duplicadas
        const alreadyExists = conv.messages.some(
          (m) => m.messageId === messageId
        );
        if (alreadyExists) continue;

        // timestamp
        const ts = msg.messageTimestamp?.low
          ? msg.messageTimestamp.low * 1000
          : Date.now();

        // ----- STICKER HANDLING -----
        if (msg.message.stickerMessage) {
          try {
            // baixa conteúdo da figurinha (iterable de chunks)
            const stream = await downloadContentFromMessage(
              msg.message.stickerMessage,
              "sticker"
            );
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
              buffer = Buffer.concat([buffer, chunk]);
            }

            // salvar webp com nome seguro
            const safeJid = jid.replace(/[:\/\\]/g, "_");
            const filename = `${safeJid}-${messageId}.webp`;
            const publicPath = path.join(STICKER_DIR, filename);
            fs.writeFileSync(publicPath, buffer);

            // push no banco
            conv.messages.push({
              type: "sticker",
              url: `/stickers/${encodeURIComponent(filename)}`, // caminho público
              fromMe: msg.key.fromMe || false,
              timestamp: ts,
              messageId,
            });

            await conv.save();

            // emitir via socket para front-end com type 'sticker'
            if (globalIO) {
              globalIO.emit("message:new", {
                jid,
                type: "sticker",
                url: `/stickers/${encodeURIComponent(filename)}`,
                fromMe: msg.key.fromMe || false,
                name: msg.pushName || jid,
                messageId,
                timestamp: ts,
              });
            }

            continue; // passa pro próximo msg
          } catch (err) {
            console.error("Erro ao baixar/storer sticker:", err);
            // fallback: salvar apenas placeholder text
            conv.messages.push({
              text: "[figurinha]",
              fromMe: msg.key.fromMe || false,
              timestamp: ts,
              messageId,
            });
            await conv.save();
            if (globalIO) {
              globalIO.emit("message:new", {
                jid,
                text: "[figurinha]",
                fromMe: msg.key.fromMe || false,
                name: msg.pushName || jid,
                messageId,
                timestamp: ts,
              });
            }
            continue;
          }
        }

        conv.messages.push({
          text,
          fromMe,
          timestamp: msg.messageTimestamp?.low
            ? msg.messageTimestamp.low * 1000
            : Date.now(),
          messageId,
        });

        await conv.save();
        if (globalIO) {
          globalIO.emit("message:new", {
            jid,
            text,
            fromMe,
            name: msg.pushName || jid,
            messageId,
            timestamp: msg.messageTimestamp?.low
              ? msg.messageTimestamp.low * 1000
              : Date.now(),
          });
        }
      } catch (err) {
        console.error(
          `⚠️ Erro ao processar mensagem de ${msg.key.remoteJid}:`,
          err.message
        );
        // Continua processando outras mensagens mesmo com erro
        continue;
      }
    }
  });

  // CORREÇÃO CRÍTICA: A assinatura do evento estava errada.
  // O evento 'messages.update' retorna um ARRAY de updates.
  // Você estava desestruturando '{ messages: newMessages }' (que não existe)
  // e iterando sobre 'updates' (que estava indefinido).
  sock.ev.on("messages.update", async (updates) => {
    try {
      for (const { key, update } of updates) {
        const messageId = key.id;
        const status = update.status; // pode ser 1, 2, 3, 4 (Baileys usa números)

        if (status !== undefined) {
          // Converte para texto legível
          const statusMap = {
            1: "pending",
            2: "sent",
            3: "delivered",
            4: "read",
          };

          const readableStatus = statusMap[status] || "pending";

          await Conversation.updateOne(
            { "messages.messageId": messageId }, // encontra a conversa com a mensagem
            { $set: { "messages.$.status": readableStatus } } // atualiza apenas o campo status dessa mensagem
          );

          console.log("📤 Atualização de status:", messageId, readableStatus);

          // Envia para todos os clientes conectados
          io.emit("message:status", { messageId, status: readableStatus });
        }
      }
    } catch (err) {
      console.error("❌ Erro em messages.update:", err);
    }
  });

  sock.ev.on("readReceipts.update", async (updates) => {
    try {
      for (const receipt of updates) {
        const messageIds = receipt.messageIds || [];
        for (const id of messageIds) {
          await Conversation.updateOne(
            { "messages.messageId": id },
            { $set: { "messages.$.status": "read" } }
          );
          if (globalIO) {
            globalIO.emit("message:status", {
              messageId: id,
              status: "read",
            });
          }
        }
      }
    } catch (err) {
      console.error("❌ Erro em readReceipts.update:", err);
    }
  });

  sock.ev.on("creds.update", saveCreds);
};

// ===== MIDDLEWARE DE AUTENTICAÇÃO =====
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

async function getTotalUnreadCount() {
  // Busca apenas conversas de 1-para-1 (não grupos nem newsletters)
  const conversations = await Conversation.find({
    jid: {
      $not: {
        $regex: "@g.us$|@newsletter$",
      },
    },
  });

  let totalUnread = 0;
  for (const conv of conversations) {
    const unread = conv.messages.filter(
      (msg) => !msg.fromMe && msg.status !== "read"
    ).length;
    totalUnread += unread;
  }

  console.log("📊 Total não lidas (sem grupos):", totalUnread);
  return totalUnread;
}

async function getUnreadCount(jid) {
  try {
    const conv = await Conversation.findOne({ jid });
    if (!conv) return 0;

    const unread = conv.messages.filter(
      (msg) => !msg.fromMe && msg.status !== "read"
    ).length;

    return unread;
  } catch (err) {
    console.error("❌ Erro ao contar não lidas:", err);
    return 0;
  }
}

async function markAsRead(jid) {
  try {
    // 1. Atualizar no banco de dados
    const result = await Conversation.updateOne(
      { jid },
      { $set: { "messages.$[elem].status": "read" } },
      {
        arrayFilters: [
          { "elem.fromMe": false, "elem.status": { $ne: "read" } },
        ],
      }
    );

    // 2. Enviar confirmação de leitura real para o WhatsApp
    if (sock) {
      const conv = await Conversation.findOne({ jid });
      if (conv) {
        const unreadMessages = conv.messages
          .filter((m) => !m.fromMe && m.status !== "read" && m.messageId)
          .map((m) => ({
            remoteJid: jid,
            id: m.messageId,
            fromMe: false,
          }));

        if (unreadMessages.length > 0) {
          await sock.readMessages(unreadMessages);
          console.log(
            `📖 ${unreadMessages.length} mensagens marcadas como lidas no WhatsApp`
          );
        }
      }
    }

    // 3. Notificar via socket
    if (globalIO) {
      globalIO.emit("conversation:read", { jid });

      // Atualizar contador
      const unreadCount = await getUnreadCount(jid);
      globalIO.emit("unread:update", { jid, unreadCount });
    }

    console.log(`✅ Mensagens de ${jid} marcadas como lidas`);
    return { success: true, modified: result.modifiedCount };
  } catch (err) {
    console.error("❌ Erro ao marcar como lida:", err);
    throw err;
  }
}

// ===== ENDPOINTS =====

// Registro de usuário
app.post("/register", async (req, res) => {
  try {
    const { username, number, password, role } = req.body;

    if (
      !username ||
      !number ||
      !password ||
      !role ||
      !Array.isArray(role) ||
      role.length === 0
    ) {
      return res.json({
        success: false,
        error: "Preencha todos os campos e selecione pelo menos uma área",
      });
    }

    const existingUser = await User.findOne({ number });
    if (existingUser) {
      return res.json({ success: false, error: "Número já cadastrado" });
    }

    const user = new User({ username, number, password, role });
    await user.save();

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false, error: err.message });
  }
});

// Login
app.post("/login", async (req, res) => {
  const { username, number, password } = req.body;
  const user = await User.findOne({ number });
  if (!user)
    return res.json({ success: false, error: "Usuário não encontrado" });

  const isMatch = await user.comparePassword(password);
  if (!isMatch) return res.json({ success: false, error: "Senha incorreta" });

  const token = jwt.sign({ id: user._id, number: user.number }, JWT_SECRET, {
    expiresIn: "365d",
  });
  res.json({ success: true, token, number: user.number });
});

// Listar usuários
app.get("/users", async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Erro ao buscar usuários", detalhes: err.message });
  }
});

// Buscar usuário específico
app.get("/users/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });
    res.json(user);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Erro ao buscar usuário", detalhes: err.message });
  }
});

// Buscar ID do usuário por número
app.get("/user-id/:number", async (req, res) => {
  try {
    const number = req.params.number;
    const user = await User.findOne({ number }, { _id: 1 });
    if (!user)
      return res
        .status(404)
        .json({ success: false, error: "Usuário não encontrado" });
    res.json({ success: true, id: user._id });
  } catch (err) {
    res.status(500).json({ success: false, error: "Erro ao buscar usuário" });
  }
});

// Informações do usuário logado
app.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado" });

    res.json({
      username: user.username,
      number: user.number,
      role: user.role,
    });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Erro ao buscar usuário", detalhes: err.message });
  }
});

// Deletar usuário
app.delete("/users/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await User.findByIdAndDelete(id);

    if (!resultado) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    res.json({ mensagem: "Usuário deletado com sucesso" });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Erro ao deletar usuário", detalhes: err.message });
  }
});

// Status da conexão
app.get("/status", (req, res) => res.json({ status: lastStatus }));

// QR Code
app.get("/qr", (req, res) => {
  if (lastQR) {
    res.json({ qr: lastQR });
  } else {
    res.status(404).send("QR ainda não gerado");
  }
});

// Logout/Exit
app.get("/exit", async (req, res) => {
  try {
    fs.rmSync("./auth", { recursive: true, force: true });
    if (sock) await sock.logout().catch(() => {});
    sock = null;
    lastStatus = "desconectado";
    lastQR = null;
    res.json({ success: true, message: "Desconectado com sucesso" });
    setTimeout(() => initWASocket(globalIO), 2000);
  } catch (err) {
    res.status(500).json({ error: "Erro ao desconectar" });
  }
});

// Reset de sessão (quando há problemas de decrypt)
app.get("/reset-session", async (req, res) => {
  try {
    console.log("🔄 Resetando sessão...");
    fs.rmSync("./auth", { recursive: true, force: true });
    if (sock) {
      await sock.logout().catch(() => {});
      await sock.end().catch(() => {});
    }
    sock = null;
    lastStatus = "desconectado";
    lastQR = null;

    // Reinicia em 2 segundos
    setTimeout(() => {
      initWASocket(globalIO);
    }, 2000);

    res.json({ success: true, message: "Sessão resetada. Reconectando..." });
  } catch (err) {
    console.error("❌ Erro ao resetar sessão:", err);
    res.status(500).json({ error: "Erro ao resetar sessão" });
  }
});

// Atualizar foto de perfil (CORRIGIDO)
app.get("/update-profile-picture/:jid", authMiddleware, async (req, res) => {
  const jid = decodeURIComponent(req.params.jid);
  const safeJid = jid.replace(/[:\/\\]/g, "_");
  const filePath = path.join(PROFILE_CACHE_DIR, `${safeJid}.jpg`);

  if (jid === "status@broadcast") {
    return res.json({
      img: `https://ui-avatars.com/api/?name=${encodeURIComponent(
        jid
      )}&background=random`,
    });
  }

  console.log(`📸 Solicitando foto para ${jid}`);

  try {
    // Se já existe no cache, retorna
    if (fs.existsSync(filePath)) {
      console.log(`✅ Usando cache local para ${jid}`);
      return res.json({ img: `/profile-pics/${safeJid}.jpg` });
    }

    // Tenta buscar no WhatsApp
    let imgUrl;
    try {
      imgUrl = await sock.profilePictureUrl(jid, "image");
      console.log(`🟢 URL recebida do WhatsApp: ${imgUrl}`);
    } catch (err) {
      console.log(
        `⚠️ Erro ao buscar URL no WhatsApp para ${jid}: ${err.message}`
      );
      const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(
        jid
      )}&background=random`;
      return res.json({ img: fallback });
    }

    if (!imgUrl) {
      console.log(`❌ Nenhuma URL retornada para ${jid}`);
      const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(
        jid
      )}&background=random`;
      return res.json({ img: fallback });
    }

    // Baixa e salva localmente
    const response = await axios.get(imgUrl, { responseType: "arraybuffer" });
    fs.writeFileSync(filePath, response.data);
    console.log(`💾 Foto salva localmente: ${filePath}`);

    return res.json({ img: `/profile-pics/${safeJid}.jpg` });
  } catch (err) {
    console.error("❌ Erro ao atualizar foto de perfil:", err);
    const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(
      jid
    )}&background=random`;
    return res.json({ img: fallback });
  }
});

// Listar conversas
app.get("/conversations", authMiddleware, async (req, res) => {
  try {
    const allConvs = await Conversation.find();

    // Busca todos os contatos de uma vez
    const allContacts = await Contact.find();

    // Cria um mapa de JID normalizado -> Contact para busca rápida
    const contactMap = {};
    allContacts.forEach((contact) => {
      contactMap[contact.jid] = contact;
    });

    // Aplica os nomes dos contatos às conversas
    const convsWithContacts = allConvs.map((conv) => {
      const phoneNumber = conv.jid.replace(/\D/g, "");
      const normalizedJid = `${phoneNumber}@c.us`;

      const convObj = conv.toObject();
      if (contactMap[normalizedJid]) {
        convObj.name = contactMap[normalizedJid].name;
      }

      return convObj;
    });

    res.json(convsWithContacts);
  } catch (err) {
    console.error("Erro ao buscar conversas:", err);
    res.status(500).json({ error: "Erro ao buscar conversas" });
  }
});

// Buscar conversa específica
app.get("/conversations/:jid", authMiddleware, async (req, res) => {
  try {
    const conv = await Conversation.findOne({ jid: req.params.jid });
    if (!conv)
      return res.status(404).json({ error: "Conversa não encontrada" });

    // Verifica se existe um contato salvo
    const phoneNumber = conv.jid.replace(/\D/g, "");
    const normalizedJid = `${phoneNumber}@c.us`;

    const contact = await Contact.findOne({ jid: normalizedJid });

    const convObj = conv.toObject();
    if (contact) {
      convObj.name = contact.name;
    }

    res.json(convObj);
  } catch (err) {
    res.status(500).json({ error: "Erro ao buscar conversa" });
  }
});

// Buscar ID da conversa
app.get("/conversation-id/:jid", async (req, res) => {
  try {
    const jid = req.params.jid;
    const conversation = await Conversation.findOne({ jid }, { _id: 1 });
    if (!conversation)
      return res
        .status(404)
        .json({ success: false, error: "Conversa não encontrada" });
    res.json({ success: true, id: conversation._id });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, error: "Erro ao buscar essa conversa" });
  }
});

// Atualizar status da conversa
app.post("/conversations/:jid/status", authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const conv = await Conversation.findOne({ jid: req.params.jid });
    if (!conv)
      return res.status(404).json({ error: "Conversa não encontrada" });

    conv.status = status;
    await conv.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao atualizar status" });
  }
});

// Deletar conversa (CORRIGIDO)
app.delete("/conversations/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const resultado = await Conversation.findByIdAndDelete(id);

    if (!resultado) {
      return res.status(404).json({ error: "Conversa não encontrada" });
    }

    res.json({ mensagem: "Conversa deletada com sucesso!" });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Erro ao deletar essa conversa", detalhes: err.message });
  }
});

// Enviar mensagem
app.post("/send", authMiddleware, async (req, res) => {
  try {
    const { jid, textFormatted } = req.body; // ⚠️ Use textFormatted do frontend

    // ✅ Validação crítica
    if (
      !textFormatted ||
      typeof textFormatted !== "string" ||
      !textFormatted.trim()
    ) {
      return res.status(400).json({ error: "Texto inválido ou vazio" });
    }

    if (!sock || lastStatus !== "conectado") {
      return res.status(400).json({ error: "Bot não está conectado." });
    }

    // ====== Adiciona imediatamente a mensagem local ======
    let conv = await Conversation.findOne({ jid });
    if (!conv) {
      conv = new Conversation({
        jid,
        name: jid,
        status: "queue",
        messages: [],
      });
    }

    const tempMessageId = `temp-${Date.now()}`;
    const newMsg = {
      text: textFormatted, // ✅ Use textFormatted
      fromMe: true,
      timestamp: Date.now(),
      messageId: tempMessageId,
      status: "pending",
    };

    conv.messages.push(newMsg);
    await conv.save();

    // ====== Envia mensagem ao WhatsApp ======
    let sendResult;
    try {
      sendResult = await sock.sendMessage(jid, { text: textFormatted }); // ✅ Use textFormatted
    } catch (err) {
      console.error("⚠️ Erro no envio via Baileys:", err);
      return res.status(500).json({
        error: "Erro ao enviar via WhatsApp",
        detalhes: err.message,
      });
    }

    // Atualiza ID e status
    if (sendResult?.key?.id) {
      const msgIndex = conv.messages.findIndex(
        (m) => m.messageId === tempMessageId
      );
      if (msgIndex >= 0) {
        conv.messages[msgIndex].messageId = sendResult.key.id;
        conv.messages[msgIndex].status = "sent";
        await conv.save();
      }
    }

    return res.json({
      success: true,
      message: {
        text: textFormatted,
        fromMe: true,
        messageId: sendResult?.key?.id || tempMessageId,
        status: "sent",
        timestamp: Date.now(),
      },
    });
  } catch (err) {
    console.error("❌ Erro ao enviar mensagem:", err);
    res
      .status(500)
      .json({ error: "Erro ao enviar mensagem", detalhes: err.message });
  }
});

app.get("/unread-count", authMiddleware, async (req, res) => {
  try {
    const totalUnread = await getTotalUnreadCount();
    res.json({ totalUnread });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/mark-as-read", authMiddleware, async (req, res) => {
  try {
    const { jid } = req.body;

    if (!jid) {
      return res.status(400).json({ error: "JID é obrigatório" });
    }

    await markAsRead(jid);

    res.json({ success: true, message: "Mensagens marcadas como lidas" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== ADICIONAR CONTATO =====
app.post("/contacts", authMiddleware, async (req, res) => {
  try {
    const { name, number } = req.body;

    // Validações
    if (!name || !number) {
      return res.status(400).json({ error: "Nome e número são obrigatórios" });
    }

    // Formata o número para WhatsApp JID (remove caracteres especiais)
    const cleanNumber = number.replace(/\D/g, "");
    if (cleanNumber.length < 10) {
      return res.status(400).json({ error: "Número inválido" });
    }

    // Cria JID no formato WhatsApp
    const jid = `${cleanNumber}@c.us`;

    // Verifica se contato já existe
    const existingContact = await Contact.findOne({
      $or: [{ jid }, { number }],
    });
    if (existingContact) {
      return res.status(400).json({ error: "Este contato já existe" });
    }

    // Cria novo contato
    const newContact = new Contact({
      jid,
      name,
      number: cleanNumber,
      img: null, // Pode ser atualizada depois
    });

    await newContact.save();

    res.json({
      success: true,
      message: "Contato adicionado com sucesso",
      contact: newContact,
    });
  } catch (err) {
    console.error("Erro ao adicionar contato:", err);
    res.status(500).json({ error: "Erro ao adicionar contato" });
  }
});

// ===== VERIFICAR SE CONTATO EXISTE =====
app.get("/contact-exists/:jid", authMiddleware, async (req, res) => {
  try {
    const { jid } = req.params;
    console.log("🔍 Verificando contato com JID:", jid);

    // Normaliza o JID - extrai só o número
    const phoneNumber = jid.replace(/\D/g, "");
    const normalizedJid = `${phoneNumber}@c.us`;

    console.log("📝 JID normalizado:", normalizedJid);

    const contact = await Contact.findOne({ jid: normalizedJid });
    console.log("📊 Contato encontrado:", !!contact);

    res.json({
      exists: !!contact,
      contact: contact || null,
    });
  } catch (err) {
    console.error("❌ Erro ao verificar contato:", err);
    res.status(500).json({ error: "Erro ao verificar contato" });
  }
});

// ===== DELETAR CONTATO =====
app.delete("/contacts/:jid", authMiddleware, async (req, res) => {
  try {
    const { jid } = req.params;

    if (!jid) {
      return res.status(400).json({ error: "JID é obrigatório" });
    }

    // Normaliza o JID - extrai só o número
    const phoneNumber = jid.replace(/\D/g, "");
    const normalizedJid = `${phoneNumber}@c.us`;

    console.log("🗑️ Deletando contato com JID normalizado:", normalizedJid);

    const result = await Contact.findOneAndDelete({ jid: normalizedJid });

    if (!result) {
      return res.status(404).json({ error: "Contato não encontrado" });
    }

    res.json({
      success: true,
      message: "Contato deletado com sucesso",
    });
  } catch (err) {
    console.error("Erro ao deletar contato:", err);
    res.status(500).json({ error: "Erro ao deletar contato" });
  }
});

// ===== INICIALIZAÇÃO =====
cleanExpiredProfilePics();
initWASocket(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 API rodando em http://localhost:${PORT}`);
});
