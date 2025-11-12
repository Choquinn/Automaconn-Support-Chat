//FRONTEND
// ===== CONSTANTES E VARIÁVEIS GLOBAIS =====
const deleteButton = document.getElementById("deleteBtn");
const addButton = document.getElementById("addBtn");
const exitButton = document.getElementById("exit");
const textInput = document.getElementById("text"); // id do seu index.html
const imageCache = {};
import { emojisByCategory } from "./emojisByCategory.js";

// ===== GERENCIAMENTO DE EMOJIS RECENTES =====
const RECENT_EMOJIS_KEY = "recentEmojis";
const MAX_RECENT_EMOJIS = 30;

function getRecentEmojis() {
  try {
    const stored = localStorage.getItem(RECENT_EMOJIS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (err) {
    console.error("❌ Erro ao carregar emojis recentes:", err);
    return [];
  }
}

function addRecentEmoji(emoji) {
  try {
    let recents = getRecentEmojis();
    // Remove se já existe (evita duplicatas na mesma posição)
    recents = recents.filter((e) => e !== emoji);
    // Adiciona no início
    recents.unshift(emoji);
    // Limita a MAX_RECENT_EMOJIS
    recents = recents.slice(0, MAX_RECENT_EMOJIS);
    // Salva no localStorage
    localStorage.setItem(RECENT_EMOJIS_KEY, JSON.stringify(recents));
  } catch (err) {
    console.error("❌ Erro ao salvar emoji recente:", err);
  }
}

function clearRecentEmojis() {
  try {
    localStorage.removeItem(RECENT_EMOJIS_KEY);
  } catch (err) {
    console.error("❌ Erro ao limpar emojis recentes:", err);
  }
}
let currentTab = 1;
let isLoading = true;
let currentChat = null; // ainda mantido para compatibilidade com outras partes
let currentChatJid = null; // jid do chat aberto (padronizado)
let chatHeaderCache = {};
let lastMessageCountMap = {};
let sentThisSession = [];
let messageStatusMap = {}; // armazena o status atual de cada mensagem
var moreOpened = false;

window.changeTab = changeTab;
window.openSettings = openSettings;
window.expandContact = expandContact;
window.openStatus = openStatus;
window.updateStatus = updateStatus;
window.quitSession = quitSession;
window.deleteMenu = deleteMenu;
window.addUser = addUser;
window.deleteUser = deleteUser;
window.cancelDelete = cancelDelete;
window.deleteConversation = deleteConversation;
window.emojiWindow = emojiWindow;

import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";

// Conecta ao socket.io
const socket = io("http://localhost:3000", {
  transports: ["websocket"],
});

socket.on("connect", () => {
  console.log("✅ Conectado ao servidor Socket.IO");
});
// Quando uma nova mensagem chegar
socket.on("message:new", async (msg) => {
  // Evita duplicar mensagens enviadas por mim
  if (msg.fromMe && sentThisSession.includes(msg.messageId)) return;

  if (msg && msg.jid === currentChatJid) {
    renderMessage(msg);
    scrollToBottom(true);
    return;
  }

  const unreadCount = await fetchUnreadCount();
  console.log("🔔 Título sendo atualizado com:", unreadCount);

  if (unreadCount > 0) {
    document.title = `Chat - Automaconn Chat (${unreadCount})`;
  } else {
    document.title = "Chat - Automaconn Chat";
  }

  updateConversationPreview(msg);
});

async function fetchUnreadCount() {
  try {
    const token = getToken();
    if (!token) return 0;

    const res = await fetch("/unread-count", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      console.error("❌ Erro ao buscar não lidas:", res.status);
      return 0;
    }

    const data = await res.json();
    const count = data?.totalUnread || 0;

    // Garante que é um número válido
    const validCount = Number.isInteger(count) ? count : 0;
    console.log("📊 Não lidas:", validCount);
    return validCount;
  } catch (err) {
    console.error("❌ Erro em fetchUnreadCount:", err);
    return 0;
  }
}

function emojis() {
  const emojiGrid = document.getElementById("emojis");

  // Limpar se já tinha conteúdo
  emojiGrid.innerHTML = "";

  // ===== SEÇÃO DE RECENTES =====
  const recents = getRecentEmojis();
  if (recents.length > 0) {
    const recentTitle = document.createElement("h4");
    recentTitle.textContent = "⏱️ Recentes";
    recentTitle.className = "emoji-category-title emoji-recent-title";
    emojiGrid.appendChild(recentTitle);

    const recentContainer = document.createElement("div");
    recentContainer.classList.add("emoji-section", "emoji-recent-section");

    recents.forEach((e) => {
      const span = document.createElement("span");
      span.textContent = e;
      span.classList.add("emoji", "emoji-recent");
      span.title = e;
      span.addEventListener("click", () => {
        const input = document.getElementById("text");
        if (input) {
          input.value += e;
          input.focus();
          // Atualiza lista de recentes
          addRecentEmoji(e);
          // Re-renderiza a bandeja
          emojis();
        }
      });
      recentContainer.appendChild(span);
    });

    emojiGrid.appendChild(recentContainer);

    // Divisor visual
    const divider = document.createElement("hr");
    divider.className = "emoji-divider";
    emojiGrid.appendChild(divider);
  }

  // ===== SEÇÃO DE CATEGORIAS =====
  Object.entries(emojisByCategory).forEach(([category, list]) => {
    const title = document.createElement("h4");
    title.textContent = category;
    title.className = "emoji-category-title";
    emojiGrid.appendChild(title);

    const container = document.createElement("div");
    container.classList.add("emoji-section");

    list.forEach((e) => {
      const span = document.createElement("span");
      span.textContent = e;
      span.classList.add("emoji");
      span.title = e;
      span.addEventListener("click", () => {
        const input = document.getElementById("text");
        if (input) {
          input.value += e;
          input.focus();
          // Adiciona aos recentes
          addRecentEmoji(e);
          // Re-renderiza apenas a seção de recentes
          emojis();
        }
      });
      container.appendChild(span);
    });

    emojiGrid.appendChild(container);
  });
}

// Atualização de status (pendente, enviada, entregue, lida)
socket.on("message:status", ({ messageId, status }) => {
  console.log("🔄 Atualização de status recebida:", messageId, status);
  // Atualiza o mapa interno
  messageStatusMap[messageId] = status;

  // Aplica visualmente no DOM imediatamente
  applyMessageStatus(messageId, status);
});

// Atualização do contador de não lidas (quando mensagens são marcadas como lidas)
socket.on("unread:update", ({ jid, unreadCount }) => {
  console.log("📊 Contador de não lidas atualizado:", unreadCount);
  // Atualiza o título da página
  if (unreadCount > 0) {
    document.title = `Chat - Automaconn Chat (${unreadCount})`;
  } else {
    document.title = "Chat - Automaconn Chat";
  }
});

// Variáveis de roles
var sup = false;
var trein = false;
var vend = false;
var at = false;
var admin = false;

// ===== FUNÇÕES DE TOKEN =====
let authToken = null;

function getToken() {
  return authToken;
}

function setToken(token) {
  authToken = token;
}

function clearToken() {
  authToken = null;
}

// Carrega token ao iniciar (se existir no localStorage - apenas leitura inicial)
if (localStorage.getItem("token")) {
  authToken = localStorage.getItem("token");
} else if (sessionStorage.getItem("token")) {
  authToken = sessionStorage.getItem("token");
}

// ===== TELA DE LOADING =====
function showLoading() {
  const loadingOverlay = document.getElementById("loading-overlay");
  if (loadingOverlay) {
    loadingOverlay.style.display = "flex";
  }
}

function hideLoading() {
  const loadingOverlay = document.getElementById("loading-overlay");
  if (loadingOverlay) {
    loadingOverlay.style.opacity = "0";
    setTimeout(() => {
      loadingOverlay.style.display = "none";
    }, 300);
  }
}

function applyMessageStatus(messageId, status) {
  const msgDiv = document.getElementById(messageId);
  if (!msgDiv) return;

  const statusImg = msgDiv.querySelector(".msg-status");
  if (!statusImg) return;

  statusImg.src = `../images/${status}.png`;
}

function createMessageElement(msg) {
  const div = document.createElement("div");
  div.id = msg.messageId || `msg-${Date.now()}`;
  div.className = msg.fromMe ? "msg-bubble" : "msg-bubble client";

  const time = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (msg.type === "sticker" || msg.sticker || msg.url?.endsWith(".webp")) {
    // figurinha
    const stickerUrl = msg.url || msg.sticker || msg.contentUrl; // compatibilidade
    // container with image
    div.innerHTML = `
      <div class="sticker-wrapper">
        <img class="sticker-img" src="${escapeHtml(
          stickerUrl
        )}" alt="figurinha" />
      </div>
      <p class="msg-hour ${msg.fromMe ? "" : "client"}">${time}</p>
    `;

    // fallback onerror -> replace with a tiny "não carregou"
    const tempImg = div.querySelector(".sticker-img");
    tempImg.onerror = () => {
      tempImg.onerror = null;
      tempImg.src = "/images/sticker-fallback.png"; // opcional: imagem local de fallback
    };
  } else {
    // texto normal
    const textHtml = `<p class="msg-bubble-text">${escapeHtml(
      msg.text || ""
    )}</p>`;
    const timeHtml = `<p class="msg-hour ${
      msg.fromMe ? "" : "client"
    }">${time}</p>`;
    div.innerHTML = textHtml + timeHtml;
  }

  return div;
}

// ===== INICIALIZAÇÃO =====
async function initializeApp() {
  showLoading();

  const token = getToken();
  if (!token) {
    window.location.href = "/login.html";
    return;
  }

  try {
    await checkUserRoles(token);
    await checkConnection();
    await fetchConversations();
    await preloadVisibleImages();
    isLoading = false;
    hideLoading();
  } catch (error) {
    console.error("Erro na inicialização:", error);
    hideLoading();
    alert("Erro ao carregar aplicação. Tente novamente.");
  }
}

// ===== VERIFICAÇÃO DE ROLES =====
async function checkUserRoles(token) {
  try {
    const res = await fetch("/me", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error("Erro ao verificar usuário");
    }

    const user = await res.json();

    sup = user.role.includes(1);
    trein = user.role.includes(2);
    vend = user.role.includes(3);
    at = user.role.includes(4);
    admin = user.role.includes(5);

    if (admin) {
      deleteButton.style.display = "block";
      exitButton.style.display = "block";
      addButton.style.display = "block";
    }
  } catch (error) {
    console.error("Erro ao verificar roles:", error);
    throw error;
  }
}

// ===== VERIFICAÇÃO DE CONEXÃO =====
async function checkConnection() {
  try {
    const statusRes = await fetch("/status");
    const statusData = await statusRes.json();

    console.log("Status atual:", statusData);

    if (statusData.status === "conectado") {
      // Tudo OK, continua normalmente
      return;
    }

    if (statusData.status === "reconectando") {
      // Mostra mensagem mas não redireciona ainda
      console.log("⏳ Aguardando reconexão...");
      // Tenta novamente em 3 segundos
      setTimeout(checkConnection, 3000);
      return;
    }

    // Se desconectado, redireciona para página de conexão
    if (statusData.status === "desconectado") {
      console.log("❌ Desconectado, redirecionando...");
      window.location.href = "/connect.html";
    }
  } catch (error) {
    console.error("Erro ao verificar conexão:", error);
    // Em caso de erro na API, redireciona para página de conexão
    window.location.href = "/connect.html";
  }
}

// ===== PRÉ-CARREGAMENTO DE IMAGENS =====
async function preloadVisibleImages() {
  const visibleChats = document.querySelectorAll(".menu-chats img.user-pfp");
  const promises = [];

  visibleChats.forEach((img) => {
    const jid = img.getAttribute("data-jid");
    if (jid) promises.push(updateProfilePicture(jid));
  });

  await Promise.all(promises);
}

// ===== ALTERNAR ABAS =====
function changeTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".menu-header-options").forEach((el, i) => {
    el.classList.toggle("selected", i === tab - 1);
  });
  fetchConversations();
}

// ===== LOGOUT =====
document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await fetch("/logout", { method: "POST" }).catch(() => {});
      } catch (e) {
        console.warn("Erro no logout backend:", e);
      }

      clearToken();
      localStorage.removeItem("token");
      sessionStorage.removeItem("token");
      window.location.href = "/login.html";
    });
  }
});

// ===== ADICIONAR / DELETAR USUÁRIO =====
async function addUser() {
  const token = getToken();
  if (!token) return;

  if (admin) {
    window.location.href = "/register.html";
  } else {
    alert("Você não tem permissão para fazer essa ação");
  }
}

async function deleteMenu() {
  const deleteMenuEl = document.getElementById("delete-menu");
  const res = await fetch("/users");
  const users = await res.json();
  const div = document.getElementById("delete-options");

  deleteMenuEl.style.display = "block";
  div.innerHTML = "";

  users.forEach((u) => {
    div.innerHTML += `<option value="${u.number}">${u.username}</option>`;
  });
}

async function deleteUser() {
  const select = document.getElementById("delete-sel");
  const userNumber = select.value;

  if (!userNumber) {
    alert("Escolha um usuário para deletar");
    return;
  }

  const token = getToken();
  if (!token) {
    alert("Você não está logado");
    return;
  }

  const meRes = await fetch("/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const me = await meRes.json();

  if (!me.role.includes(5)) {
    alert("Você não tem permissão para fazer essa ação");
    return;
  }

  const userRes = await fetch(`/user-id/${userNumber}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const userData = await userRes.json();

  if (!userData.success) {
    alert("Usuário não encontrado");
    return;
  }

  const res = await fetch(`/users/${userData.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.ok) {
    alert("Usuário deletado com sucesso");
    deleteMenu();
  } else {
    const err = await res.json();
    alert("Erro ao deletar usuário: " + (err.error || "Tente novamente"));
  }
}

// ===== DELETAR CONVERSA =====
async function deleteConversation(jid) {
  const more = document.getElementById("more-chat");
  const header = document.getElementById("chat-header");
  const token = getToken();

  if (!token) {
    alert("Você não está logado");
    return;
  }

  const convRes = await fetch(`/conversation-id/${jid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const convData = await convRes.json();

  if (!convData.success) {
    alert("Conversa não encontrada");
    return;
  }

  const res = await fetch(`/conversations/${convData.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.ok) {
    moreOpened = true;
    alert("Conversa deletada com sucesso");
    more.style.display = "none";
    header.style.visibility = "visible";
    fetchConversations();
    expandContact();
    const chatEl = document.getElementById("chat");
    if (chatEl) chatEl.style.display = "none";
    currentChat = null;
    currentChatJid = null;
  } else {
    const err = await res.json();
    alert("Erro ao deletar essa conversa: " + (err.error || "Tente novamente"));
  }
}

// ===== CANCELAR DELETE =====
function cancelDelete() {
  const deleteMenuEl = document.getElementById("delete-menu");
  if (deleteMenuEl) deleteMenuEl.style.display = "none";
}

// ===== SAIR DA SESSÃO =====
async function quitSession() {
  await fetch("/exit");
  checkConnection();
}

// ===== VERIFICAR SE CHAT ESTÁ ABERTO =====
function checkChat() {
  const chatEl = document.getElementById("chat");
  if (!document.querySelector(".menu-chats.selected")) {
    if (chatEl) chatEl.style.display = "none";
  } else {
    if (chatEl) chatEl.style.display = "flex";
  }
}

// ===== ATUALIZAR FOTO DE PERFIL =====
async function updateProfilePicture(jid) {
  try {
    const imgEl = document.querySelector(`img[data-jid="${jid}"]`);
    if (!imgEl) return;

    const cacheEntry = imageCache[jid];
    const cacheValid =
      cacheEntry && Date.now() - cacheEntry.timestamp < 60 * 60 * 1000;

    if (cacheValid && imgEl.src.includes(cacheEntry.url)) {
      return;
    }

    const res = await fetch(
      `/update-profile-picture/${encodeURIComponent(jid)}`,
      {
        headers: { Authorization: `Bearer ${getToken()}` },
      }
    );

    if (res.status === 204) {
      imgEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
        jid
      )}&background=random`;
      imageCache[jid] = { url: imgEl.src, timestamp: Date.now() };
      return;
    }

    const contentType = res.headers.get("content-type") || "";
    let imgUrl;

    if (contentType.includes("application/json")) {
      const data = await res.json();
      imgUrl = data.img;
    } else {
      imgUrl = `/profile-pics/${encodeURIComponent(jid)}.jpg`;
    }

    if (imgEl.src !== imgUrl) {
      imgEl.src = imgUrl;
      imageCache[jid] = { url: imgUrl, timestamp: Date.now() };
    }
  } catch (err) {
    console.error(`Erro ao atualizar imagem de ${jid}:`, err);
  }
}

function safeUpdateProfilePicture(jid, retries = 5) {
  const imgEl = document.querySelector(`img[data-jid="${jid}"]`);
  if (imgEl) {
    updateProfilePicture(jid);
  } else if (retries > 0) {
    setTimeout(() => safeUpdateProfilePicture(jid, retries - 1), 200);
  }
}

// ===== BUSCAR CONVERSAS =====
async function fetchConversations() {
  const token = getToken();
  if (!token) {
    alert("Você não está logado");
    window.location.href = "/login.html";
    return;
  }

  try {
    const res = await fetch("/conversations", {
      headers: { Authorization: "Bearer " + token },
    });

    if (!res.ok) throw new Error("Erro ao buscar conversas");
    const data = await res.json();

    const dataWithoutGroups = data.filter(
      (c) => !c.jid.endsWith("@g.us") && !c.jid.endsWith("@newsletter")
    );

    const container = document.getElementById("menu-chat-block");
    if (!container) return;
    const existingChats = {};

    container.querySelectorAll(".menu-chats").forEach((div) => {
      existingChats[div.getAttribute("data-jid")] = div;
    });

    let filtered = [];
    if (currentTab === 1)
      filtered = dataWithoutGroups.filter((c) => c.status === "active");
    if (currentTab === 2)
      filtered = dataWithoutGroups.filter((c) => c.status === "queue");
    if (currentTab === 3)
      filtered = dataWithoutGroups.filter((c) => c.status === "closed");

    for (const c of filtered) {
      let div = existingChats[c.jid];

      if (!div) {
        div = document.createElement("div");
        div.className = "menu-chats";
        div.setAttribute("data-jid", c.jid);
        div.innerHTML = `
          <img class="user-pfp" data-jid="${c.jid}" 
            src="${c.img || `/profile-pics/${encodeURIComponent(c.jid)}.jpg`}" 
            onerror="null;"/>
          <h2 class="client-name"></h2>
          <p class="latest-msg"></p>
        `;
        container.appendChild(div);

        div.addEventListener("click", () => {
          currentChat = c.jid;
          currentChatJid = c.jid; // define o JID do chat atual
          openChat(c.jid);
          document
            .querySelectorAll(".menu-chats")
            .forEach((el) => el.classList.remove("selected"));
          div.classList.add("selected");
          checkChat();
        });
      }

      div.querySelector(".client-name").textContent = c.name;

      // Formata asteriscos em <strong>
      const lastMsgText = c.messages.slice(-1)[0]?.text || "";
      const formattedText = lastMsgText.replace(
        /\*([^*]+)\*/g,
        "<strong>$1</strong>"
      );
      div.querySelector(".latest-msg").innerHTML = formattedText;

      if (currentChat === c.jid) {
        div.classList.add("selected");
      } else {
        div.classList.remove("selected");
      }

      safeUpdateProfilePicture(c.jid);
    }

    Object.keys(existingChats).forEach((jid) => {
      if (!filtered.find((c) => c.jid === jid)) {
        existingChats[jid].remove();
      }
    });
  } catch (err) {
    console.error("Erro ao buscar conversas:", err);
  }
}

const span = document.getElementById("anexo-sym");
const fileInput = document.createElement("input");
const fileBlock = document.getElementById("file");
const fileCancel = document.getElementById("close-attach-sym");
const fileInfo = document.getElementById("file-info");
fileInput.type = "file";
fileInput.style.display = "none";

span.addEventListener("click", () => {
  fileInput.click();
});

// Adiciona o evento quando o usuário selecionar um arquivo
fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) {
    console.log("Arquivo selecionado:", file.name);
    console.log("Tipo:", file.type);
    console.log("Tamanho:", file.size);
    fileBlock.style.display = "block";
    fileInfo.innerHTML = `
      <img src="../images/file-icon.png" alt="file" class="file-icon"/>
      <h2>${file.name}</h2>
      <p>${(file.size / 1024).toFixed(2)} KB</p>
    `;
    // handleFile(file);
  }
});

fileCancel.addEventListener("click", () => {
  fileBlock.style.display = "none";
  fileInput.value = "";
  fileInput.files = null;
});

var emojiOpen = false;

function emojiWindow() {
  const emojiDiv = document.getElementById("emojis");

  if (emojiOpen === false) {
    // Se ainda está vazio, popula com emojis
    if (emojiDiv.innerHTML === "") {
      emojis();
    }
    emojiDiv.style.display = "block";
    emojiOpen = true;
  } else {
    emojiDiv.style.display = "none";
    emojiOpen = false;
  }
}

// ===== RENDERIZAR BOTÕES DE STATUS =====
function renderStatusButtons(c) {
  const statusContainer = document.getElementById("status-buttons");
  if (!statusContainer) return;
  statusContainer.innerHTML = `
    <button id="ativar" onclick="updateStatus('${c.jid}', 'active')">Ativar</button>
    <button id="fila" onclick="updateStatus('${c.jid}', 'queue')">Fila</button>
    <button id="fechar" onclick="updateStatus('${c.jid}', 'closed')">Fechar</button>
  `;
}

// Renderiza várias mensagens (historico)
function renderMessages(chatContainer, messages) {
  if (!chatContainer || !messages || !Array.isArray(messages)) return;

  chatContainer.innerHTML = "";

  messages.forEach((msg) => {
    // Evita duplicar mensagens enviadas por mim
    if (msg.fromMe && sentThisSession.includes(msg.messageId)) return;

    if (msg.type === "sticker") {
      const div = document.createElement("div");
      div.className = `msg ${msg.fromMe ? "me" : "client"}`;
      div.innerHTML = `
        <div class="sticker-wrapper">
          <img class="sticker-img" src="${msg.url}" alt="figurinha" />
        </div>
        <p class="msg-hour ${msg.fromMe ? "" : "client"}">${time}</p>
      `;
      chatHistory.appendChild(div);
      return;
    }

    const div = document.createElement("div");
    div.id = msg.messageId;
    div.className = msg.fromMe ? "msg-bubble" : "msg-bubble client";
    const time = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    if (msg.fromMe) {
      div.innerHTML = `
        <p class="msg-bubble-text">${formatarAsteriscos(msg.text)}</p>
        <span class="msg-info">
          <p class="msg-hour ${msg.fromMe ? "" : "client"}">${time}</p>
          <img class="msg-status" src="../images/${
            msg.status || "pending"
          }.png" />
        </span>
      `;
    } else {
      div.innerHTML = `
        <p class="msg-bubble-text">${escapeHtml(msg.text)}</p>
        <span class="msg-info client">
          <p class="msg-hour ${msg.fromMe ? "" : "client"}">${time}</p>
        </span>
      `;
    }
    chatContainer.appendChild(div);
  });

  scrollToBottom(false);
}

// Formata asteriscos em <strong>
function formatarAsteriscos(texto) {
  return texto.replace(/\*([^*]+)\*/g, "<strong>$1</strong><br>");
}

// Renderiza uma única mensagem (usado por socket e por envio local)
function renderMessage(msg) {
  if (!msg || !msg.jid) return;
  const chatContainer = document.getElementById("chat-history");
  if (!chatContainer) return;

  if (msg.type === "sticker") {
    const msgDiv = document.createElement("div");
    msgDiv.className = `msg ${msg.fromMe ? "me" : "client"}`;

    const stickerImg = document.createElement("img");
    stickerImg.src = msg.url;
    stickerImg.alt = "figurinha";
    stickerImg.className = "sticker-img";

    // fallback caso falhe
    stickerImg.onerror = () => {
      stickerImg.src = "/images/sticker-fallback.png";
    };

    msgDiv.appendChild(stickerImg);

    // horário
    const hourEl = document.createElement("p");
    hourEl.className = `msg-hour ${msg.fromMe ? "" : "client"}`;
    hourEl.textContent = time;
    msgDiv.appendChild(hourEl);

    chatHistory.appendChild(msgDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight; // auto scroll
    return;
  }

  // Evita duplicatas
  if (document.getElementById(msg.messageId)) return;

  const div = document.createElement("div");
  div.id = msg.messageId;
  div.className = msg.fromMe ? "msg-bubble" : "msg-bubble client";
  const time = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (msg.fromMe) {
    div.innerHTML = `
      <p class="msg-bubble-text">${formatarAsteriscos(msg.text)}</p>
      <span class="msg-info">
        <p class="msg-hour ${msg.fromMe ? "" : "client"}">${time}</p>
        <img class="msg-status" src="../images/${
          msg.status || "pending"
        }.png" />
      </span>
    `;
  } else {
    div.innerHTML = `
      <p class="msg-bubble-text">${escapeHtml(msg.text)}</p>
      <span class="msg-info client">
        <p class="msg-hour ${msg.fromMe ? "" : "client"}">${time}</p>
      </span>
    `;
  }

  chatContainer.appendChild(div);

  // 🔽 Rola após renderização completa
  setTimeout(() => {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }, 50);
}

// Atualiza preview de conversa (simples: recarrega lista)
function updateConversationPreview(msg) {
  // Implementação simples: refetch da lista.
  // Pode ser substituída por atualização incremental para mais performance.
  fetchConversations();
}

// ===== ATUALIZAR STATUS =====
async function updateStatus(jid, status) {
  await fetch(`/conversations/${jid}/status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + getToken(),
    },
    body: JSON.stringify({ status }),
  });

  switch (status) {
    case "active":
      changeTab(1);
      break;
    case "queue":
      changeTab(2);
      break;
    case "closed":
      changeTab(3);
      break;
  }
  fetchConversations();
}

// ===== SCROLL TO BOTTOM =====
function scrollToBottom(smooth = false) {
  const chatContainer = document.getElementById("chat-history");
  if (!chatContainer) return;

  const doScroll = () => {
    chatContainer.scrollTo({
      top: chatContainer.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  };

  requestAnimationFrame(doScroll);
  setTimeout(doScroll, 100); // garante mesmo se o layout demorar
}

// ===== EXPANDIR CONTATO =====
function expandContact() {
  const more = document.getElementById("more-chat");
  const button = document.getElementById("mais-sym");
  const buttons = document.getElementById("more-buttons");
  const header = document.getElementById("chat-header");
  const div = document.querySelector(".menu-chats.selected");

  if (moreOpened === false) {
    const jid = div.getAttribute("data-jid");
    buttons.innerHTML = `
      <button id="delete-conv" class="configbtn delete" onclick="deleteConversation('${jid}')">Deletar conversa</button>
    `;
    if (header) header.style.visibility = "hidden";
    if (more) more.style.display = "block";
    if (button) {
      button.style.visibility = "visible";
      button.classList.add("opened");
    }
    moreOpened = true;
  } else {
    more.style.display = "none";
    header.style.visibility = "visible";
    button.classList.remove("opened");
    moreOpened = false;
  }
}

// ===== ABRIR CONVERSA =====
async function openChat(jid) {
  const token = getToken();
  if (!token) return (window.location.href = "/login.html");

  const chatContainer = document.getElementById("chat-history");
  const headerName = document.getElementById("client-name");
  const headerImg = document.getElementById("pfp");

  if (headerImg) headerImg.setAttribute("data-jid", jid);

  const cached = chatHeaderCache[jid];
  if (cached) {
    if (headerName) headerName.textContent = cached.name;
    if (headerImg) headerImg.src = cached.img;
  } else {
    if (headerName) headerName.textContent = "Carregando...";
    const cachedImage = imageCache[jid];
    if (headerImg)
      headerImg.src = cachedImage
        ? cachedImage.url
        : `https://ui-avatars.com/api/?name=${encodeURIComponent(
            jid
          )}&background=random`;
  }

  try {
    const res = await fetch(`/conversations/${encodeURIComponent(jid)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Não foi possível carregar a conversa");

    await fetch("/mark-as-read", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ jid }),
    });

    const data = await res.json();
    if (headerName) headerName.textContent = data.name;

    // Atualiza imagem (tenta buscar no backend)
    try {
      const imgRes = await fetch(
        `/update-profile-picture/${encodeURIComponent(jid)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      let imgUrl;

      if (imgRes.status === 204) {
        imgUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(
          data.name
        )}&background=random`;
      } else {
        const contentType = imgRes.headers.get("content-type") || "";
        imgUrl = contentType.includes("application/json")
          ? (await imgRes.json()).img
          : `/profile-pics/${encodeURIComponent(jid)}.jpg`;
      }

      if (headerImg) headerImg.src = imgUrl;
      imageCache[jid] = { url: imgUrl, timestamp: Date.now() };
    } catch {
      if (headerImg)
        headerImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
          data.name
        )}&background=random`;
    }

    chatHeaderCache[jid] = {
      name: data.name,
      img: headerImg ? headerImg.src : null,
    };
    renderStatusButtons(data);

    // Renderiza mensagens
    if (chatContainer) {
      chatContainer.innerHTML = "";
      renderMessages(chatContainer, data.messages || []);
    }
    lastMessageCountMap[jid] = (data.messages || []).length;

    scrollToBottom(false);

    currentChatJid = jid;
    currentChat = jid;
  } catch (err) {
    console.error("Erro ao abrir conversa:", err);
  }
}

// ===== ATUALIZAR CHAT ABERTO =====
async function updateChat(jid) {
  const token = getToken();
  if (!token) return;

  const chatContainer = document.getElementById("chat-history");
  if (!chatContainer) return;

  try {
    const res = await fetch(`/conversations/${encodeURIComponent(jid)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;

    const data = await res.json();
    if (!data.messages || !Array.isArray(data.messages)) return;

    const lastMessageCount = lastMessageCountMap[jid] || 0;
    const newMessages = data.messages.slice(lastMessageCount);

    if (newMessages.length > 0) {
      renderMessages(chatContainer, newMessages);

      const isNearBottom =
        chatContainer.scrollHeight -
          chatContainer.scrollTop -
          chatContainer.clientHeight <
        30;
      if (isNearBottom) scrollToBottom(true);

      lastMessageCountMap[jid] = data.messages.length;
    }
  } catch (err) {
    console.error("Erro ao atualizar chat:", err);
  }
}

function capitalizeFirstLetter(val) {
  return String(val).charAt(0).toUpperCase() + String(val).slice(1);
}

// ===== ABRIR / FECHAR CONFIGURAÇÕES =====
var settingsOpen = false;
function openSettings() {
  const configButton = document.getElementById("config-menu");
  if (!configButton) return;
  if (!settingsOpen) {
    configButton.style.display = "block";
    settingsOpen = true;
  } else {
    configButton.style.display = "none";
    settingsOpen = false;
  }
}

// ===== ABRIR STATUS =====
var statusOpen = false;
function openStatus() {
  const statusButton = document.getElementById("status-buttons");
  if (!statusButton) return;
  if (!statusOpen) {
    statusButton.style.display = "flex";
    statusOpen = true;
  } else {
    statusButton.style.display = "none";
    statusOpen = false;
  }
}

// ===== ENVIO DE MENSAGENS =====
async function sendMessage() {
  const input = document.querySelector("#text");
  if (!input) return;

  const token = getToken();
  const res = await fetch("/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const username = await res.json();
  const user = username.username;
  const userFormatted = capitalizeFirstLetter(user);

  if (!token) return;

  const inputValue = input.value.trim();

  // ✅ Validação adicional
  if (!inputValue) {
    console.warn("⚠️ Tentativa de enviar mensagem vazia");
    return;
  }

  const text = `<strong>${userFormatted}:</strong><br>${inputValue}`;
  const textFormatted = `*${userFormatted}:*\n${inputValue}`;

  if (!currentChatJid) {
    console.warn("⚠️ Nenhum chat selecionado");
    return;
  }

  const tempId = `temp-${Date.now()}`;
  sentThisSession.push(tempId);

  renderMessage({
    text,
    fromMe: true,
    name: "Você",
    status: "pending",
    messageId: tempId,
    timestamp: Date.now(),
    jid: currentChatJid,
  });

  input.value = "";

  try {
    const res = await fetch("/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jid: currentChatJid,
        textFormatted, // ✅ Envia textFormatted
      }),
    });

    if (!res.ok) {
      const error = await res.json();
      console.error("❌ Erro do servidor:", error);

      // Remove mensagem temporária se falhar
      const tempDiv = document.getElementById(tempId);
      if (tempDiv) tempDiv.remove();

      alert("Erro ao enviar mensagem: " + (error.error || "Tente novamente"));
      return;
    }

    const data = await res.json();

    if (data?.message?.messageId) {
      const newId = data.message.messageId;
      sentThisSession.push(newId);

      const tempDiv = document.getElementById(tempId);
      if (tempDiv) {
        tempDiv.id = newId;
      }
    }
  } catch (err) {
    console.error("Erro ao enviar mensagem:", err);

    // Remove mensagem temporária se falhar
    const tempDiv = document.getElementById(tempId);
    if (tempDiv) tempDiv.remove();

    alert("Erro de conexão ao enviar mensagem");
  }
}

// Atalho por enter
if (textInput) {
  textInput.addEventListener("keypress", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      await sendMessage();
    }
  });
}

// ===== ATUALIZAÇÕES AUTOMÁTICAS =====
setInterval(fetchConversations, 2000);
setInterval(() => {
  if (!socket.connected && currentChatJid) {
    updateChat(currentChatJid);
  }
}, 3000);

// ===== INICIALIZA A APLICAÇÃO =====
initializeApp();
checkChat();

// ===== UTILIDADES =====
function escapeHtml(unsafe) {
  if (!unsafe && unsafe !== 0) return "";
  return String(unsafe)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
