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

// ===== GERENCIAMENTO DE STICKERS SEM DUPLICATAS =====
const SAVED_STICKERS_KEY = "savedStickers";
const MAX_SAVED_STICKERS = 100;

async function generateStickerHash(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return hashHex;
  } catch (err) {
    console.error("❌ Erro ao gerar hash:", err);
    return null;
  }
}

function getSavedStickersHashes() {
  try {
    const stored = localStorage.getItem(SAVED_STICKERS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (err) {
    console.error("❌ Erro ao carregar stickers salvos:", err);
    return [];
  }
}

async function addStickerToFavorites(stickerUrl, stickerName) {
  try {
    let stickers = getSavedStickersHashes();

    // Gera hash do sticker para evitar duplicatas baseadas no conteúdo
    const hash = await generateStickerHash(stickerUrl);
    if (!hash) {
      console.warn("⚠️ Não foi possível gerar hash do sticker");
      return false;
    }

    // Verifica se já existe um sticker com o mesmo hash
    const isDuplicate = stickers.some((s) => s.hash === hash);
    if (isDuplicate) {
      console.warn("⚠️ Este sticker já está salvo");
      return false;
    }

    const newSticker = {
      url: stickerUrl,
      name: stickerName,
      hash: hash,
      addedAt: Date.now(),
    };

    // Adiciona novo
    stickers.unshift(newSticker);

    // Limita ao máximo
    stickers = stickers.slice(0, MAX_SAVED_STICKERS);

    localStorage.setItem(SAVED_STICKERS_KEY, JSON.stringify(stickers));
    console.log("✅ Sticker adicionado aos favoritos!");
    return true;
  } catch (err) {
    console.error("❌ Erro ao salvar nos favoritos:", err);
    return false;
  }
}

function removeStickerFromFavorites(stickerUrl) {
  try {
    let stickers = getSavedStickersHashes();
    console.log("📍 Removendo sticker:", stickerUrl);
    console.log("📍 Stickers antes:", stickers);

    // Filtra removendo o sticker que tem a URL correspondente
    stickers = stickers.filter((s) => {
      const match = s.url === stickerUrl;
      console.log(`Comparando ${s.url} === ${stickerUrl} ?`, match);
      return !match;
    });

    console.log("📍 Stickers depois:", stickers);
    localStorage.setItem(SAVED_STICKERS_KEY, JSON.stringify(stickers));
    console.log("✅ Sticker removido com sucesso!");
    return true;
  } catch (err) {
    console.error("❌ Erro ao remover de favoritos:", err);
    return false;
  }
}

async function isStickerInFavorites(stickerUrl) {
  try {
    const stickers = getSavedStickersHashes();
    // Se já temos o hash, comparar por hash
    const hash = await generateStickerHash(stickerUrl);
    if (hash) {
      return stickers.some((s) => s.hash === hash);
    }
    // Fallback: comparar por URL
    return stickers.some((s) => s.url === stickerUrl);
  } catch (err) {
    console.error("❌ Erro ao verificar favoritos:", err);
    return false;
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
window.openAdd = openAdd;
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
window.openAdd = openAdd;
window.addContact = addContact;
window.saveContactFromChat = saveContactFromChat;
window.deleteContact = deleteContact;
window.openStickerMenu = openStickerMenu;
window.closeStickerMenu = closeStickerMenu;
window.sendSticker = sendSticker;
window.sendStickerFromFile = sendStickerFromFile;
window.saveReceivedSticker = saveReceivedSticker;

import { io } from "https://cdn.socket.io/4.7.5/socket.io.esm.min.js";

// Conecta ao socket.io
const socket = io("http://localhost:3000", {
  transports: ["websocket"],
});

socket.on("connect", () => {
  // console.log("✅ Conectado ao servidor Socket.IO");
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
  // console.log("🔔 Título sendo atualizado com:", unreadCount);

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
    // console.log("📊 Não lidas:", validCount);
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
  // console.log("🔄 Atualização de status recebida:", messageId, status);
  // Atualiza o mapa interno
  messageStatusMap[messageId] = status;

  // Aplica visualmente no DOM imediatamente
  applyMessageStatus(messageId, status);
});

// Atualização do contador de não lidas (quando mensagens são marcadas como lidas)
socket.on("unread:update", ({ jid, unreadCount }) => {
  // console.log("📊 Contador de não lidas atualizado:", unreadCount);
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

    // console.log("Status atual:", statusData);

    if (statusData.status === "conectado") {
      // Tudo OK, continua normalmente
      return;
    }

    if (statusData.status === "reconectando") {
      // Mostra mensagem mas não redireciona ainda
      // console.log("⏳ Aguardando reconexão...");
      // Tenta novamente em 3 segundos
      setTimeout(checkConnection, 3000);
      return;
    }

    // Se desconectado, redireciona para página de conexão
    if (statusData.status === "desconectado") {
      // console.log("❌ Desconectado, redirecionando...");
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

// ===== SALVAR CONTATO DO CHAT =====
function saveContactFromChat() {
  const jid = currentChatJid;
  if (!jid) {
    alert("Nenhuma conversa aberta");
    return;
  }

  // Extrai o número do JID
  const phoneNumber = jid.replace(/\D/g, "");

  // Abre o menu de adicionar contato
  openAdd();

  // Preenche o número automaticamente
  const numberInput = document.getElementById("add-number");
  if (numberInput) {
    numberInput.value = phoneNumber;
    numberInput.disabled = true; // Desabilita para o usuário não mudar
  }

  // Coloca o foco no campo de nome
  const nameInput = document.getElementById("add-name");
  if (nameInput) {
    nameInput.focus();
    nameInput.value = ""; // Limpa se houver algo
  }
}

// ===== DELETAR CONTATO =====
async function deleteContact() {
  const jid = currentChatJid;
  if (!jid) {
    alert("Nenhuma conversa aberta");
    return;
  }

  const token = getToken();
  if (!token) {
    alert("Você não está logado");
    return;
  }

  // Confirmação
  if (!confirm("Tem certeza que deseja deletar este contato?")) {
    return;
  }

  try {
    const res = await fetch(`/contacts/${encodeURIComponent(jid)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();

    if (res.ok) {
      alert("✅ Contato deletado com sucesso!");
      // Atualiza o nome na barra lateral para mostrar apenas o número
      fetchConversations();
      // Fecha o menu de mais opções (more-chat)
      if (moreOpened) {
        expandContact();
      }
      // Verifica novamente os botões
      checkAndToggleSaveContactButton(jid);
    } else {
      alert(`❌ Erro: ${data.error || "Não foi possível deletar o contato"}`);
    }
  } catch (err) {
    console.error("Erro ao deletar contato:", err);
    alert("❌ Erro ao deletar contato. Tente novamente.");
  }
}

// ===== VERIFICAR E MOSTRAR/ESCONDER BOTÃO SALVAR CONTATO =====
async function checkAndToggleSaveContactButton(jid) {
  const saveContactBtn = document.getElementById("save-contact-btn");
  const deleteContactBtn = document.getElementById("delete-contact-btn");

  // console.log("🔍 Verificando contato com JID:", jid);
  // console.log("Botões encontrados:", {
  //   saveContactBtn: !!saveContactBtn,
  //   deleteContactBtn: !!deleteContactBtn,
  // });

  const token = getToken();
  if (!token) {
    console.warn("⚠️ Token não encontrado");
    if (saveContactBtn) saveContactBtn.classList.remove("visible");
    if (deleteContactBtn) deleteContactBtn.classList.remove("visible");
    return;
  }

  try {
    const encodedJid = encodeURIComponent(jid);
    // console.log("📤 Enviando para API:", `/contact-exists/${encodedJid}`);

    const res = await fetch(`/contact-exists/${encodedJid}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // console.log("📡 Status da API:", res.status);

    if (res.ok) {
      const data = await res.json();
      // console.log("✅ Resposta da API:", JSON.stringify(data));

      // Se o contato não existe, mostra botão de salvar
      if (data.exists === false) {
        // console.log("📍 Contato NÃO existe - mostrando botão 'Salvar'");
        if (saveContactBtn) saveContactBtn.classList.add("visible");
        if (deleteContactBtn) deleteContactBtn.classList.remove("visible");
      } else {
        // Se o contato existe, mostra botão de deletar
        // console.log("📍 Contato existe - mostrando botão 'Deletar'");
        if (saveContactBtn) saveContactBtn.classList.remove("visible");
        if (deleteContactBtn) deleteContactBtn.classList.add("visible");
      }
    } else {
      console.error("❌ Erro na resposta da API:", res.status);
      // Se houver erro na verificação, esconde ambos
      if (saveContactBtn) saveContactBtn.classList.remove("visible");
      if (deleteContactBtn) deleteContactBtn.classList.remove("visible");
    }
  } catch (err) {
    console.error("❌ Erro ao verificar contato:", err);
    if (saveContactBtn) saveContactBtn.classList.remove("visible");
    if (deleteContactBtn) deleteContactBtn.classList.remove("visible");
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

      // Exibe o nome diretamente (backend já retorna número ou nome salvo)
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
    // console.log("Arquivo selecionado:", file.name);
    // console.log("Tipo:", file.type);
    // console.log("Tamanho:", file.size);
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

// ===== GERENCIAMENTO DE STICKERS =====
var stickerMenuOpen = false;

function openStickerMenu() {
  const stickerMenu = document.getElementById("stickers-menu");
  const stickersInput = document.getElementById("sticker-input");
  const emojiDiv = document.getElementById("emojis");

  if (!stickerMenuOpen) {
    // Fecha emoji se estiver aberto
    if (emojiOpen) {
      emojiDiv.style.display = "none";
      emojiOpen = false;
    }

    stickerMenu.style.display = "flex";
    stickerMenuOpen = true;

    // Carrega stickers salvos
    loadSavedStickers();

    // Evento para upload
    stickersInput.addEventListener("change", handleStickerUpload);
  } else {
    closeStickerMenu();
  }
}

function closeStickerMenu() {
  const stickerMenu = document.getElementById("stickers-menu");
  stickerMenu.style.display = "none";
  stickerMenuOpen = false;
}

function loadSavedStickers() {
  const stickersList = document.getElementById("stickers-list");
  const token = getToken();

  if (!token) return;

  // Limpa a lista
  stickersList.innerHTML = "";

  // Faz fetch para listar stickers salvos
  fetch("/stickers-list", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
    .then((res) => res.json())
    .then(async (data) => {
      if (data.success && data.stickers.length > 0) {
        console.log("📦 Stickers carregados:", data.stickers);

        // Deduplica por URL
        const seenUrls = new Set();
        const uniqueStickers = data.stickers.filter((sticker) => {
          if (seenUrls.has(sticker.url)) {
            return false;
          }
          seenUrls.add(sticker.url);
          return true;
        });

        // Filtra apenas os stickers que estão nos favoritos
        const favoriteStickers = [];
        for (const sticker of uniqueStickers) {
          const inFavs = await isStickerInFavorites(sticker.url);
          console.log(`📍 ${sticker.name} está nos favoritos?`, inFavs);
          if (inFavs) {
            favoriteStickers.push(sticker);
          }
        }

        if (favoriteStickers.length === 0) {
          console.log("📦 Nenhum sticker favoritado");
          stickersList.innerHTML =
            '<p style="grid-column: 1/3; text-align: center; color: #999;">Nenhum sticker favoritado</p>';
          return;
        }

        // Ordena por data de adição (mais recentes primeiro)
        const savedStickers = getSavedStickersHashes();
        favoriteStickers.sort((a, b) => {
          const aIndex = savedStickers.findIndex((s) => s.url === a.url);
          const bIndex = savedStickers.findIndex((s) => s.url === b.url);
          return bIndex - aIndex; // Mais recentes primeiro
        });

        favoriteStickers.forEach((sticker) => {
          const stickerDiv = document.createElement("div");
          stickerDiv.className = "sticker-item";
          stickerDiv.id = `sticker-${sticker.url.replace(/[^a-zA-Z0-9]/g, "")}`;

          stickerDiv.innerHTML = `
            <div style="position: relative; width: 100%; height: 100%;">
              <img src="${sticker.url}" alt="sticker" style="width: 100%; height: 100%;" />
              <span style="position: absolute; top: 2px; right: 2px; font-size: 1.2em;">⭐</span>
            </div>
            <span class="sticker-item-name">${sticker.name}</span>
          `;

          // Clique normal envia o sticker
          stickerDiv.onclick = async () => {
            await sendStickerFromFile(sticker.url, sticker.name);
          };

          // Clique com botão direito mostra menu de contexto
          stickerDiv.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            showStickerContextMenu(e, sticker.url, stickerDiv);
          });

          stickersList.appendChild(stickerDiv);
        });
      } else {
        console.log("📦 Nenhum sticker salvo ainda");
        stickersList.innerHTML =
          '<p style="grid-column: 1/3; text-align: center; color: #999;">Nenhum sticker favoritado</p>';
      }
    })
    .catch((err) => console.error("❌ Erro ao carregar stickers:", err));
}

async function handleStickerUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  // Validação de tipo - agora aceita webp, png e jpeg
  const allowedTypes = ["image/webp", "image/png", "image/jpeg"];
  const isValidType =
    allowedTypes.includes(file.type) ||
    /\.(webp|png|jpg|jpeg)$/i.test(file.name);

  if (!isValidType) {
    alert("❌ Por favor, selecione um arquivo .webp, .png ou .jpeg");
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    alert("❌ O arquivo deve ter menos de 10MB");
    return;
  }

  // Faz upload/envio
  await sendSticker(file);
}

async function sendSticker(file) {
  const token = getToken();
  const jid = currentChatJid;

  if (!token) {
    alert("❌ Você não está logado");
    return;
  }

  if (!jid) {
    alert("❌ Nenhuma conversa aberta");
    return;
  }

  try {
    console.log("📤 Enviando sticker...");

    // Cria FormData para envio de arquivo
    const formData = new FormData();
    formData.append("sticker", file);
    formData.append("jid", jid);

    const res = await fetch("/send-sticker", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const data = await res.json();

    if (res.ok) {
      console.log("✅ Sticker enviado com sucesso!");

      // Renderiza o sticker na conversa
      renderMessage({
        type: "sticker",
        fromMe: true,
        messageId: data.message.messageId,
        status: "sent",
        timestamp: Date.now(),
        url: data.message.url,
        jid: jid,
      });

      // Fecha o menu
      closeStickerMenu();

      // Limpa input
      document.getElementById("sticker-input").value = "";

      // Rola para o fim
      scrollToBottom(true);
    } else {
      alert(`❌ Erro: ${data.error || "Não foi possível enviar o sticker"}`);
    }
  } catch (err) {
    console.error("❌ Erro ao enviar sticker:", err);
    alert("❌ Erro ao enviar sticker. Tente novamente.");
  }
}

// ===== ENVIAR STICKER DA GALERIA =====
async function sendStickerFromFile(stickerUrl, stickerName) {
  const token = getToken();
  const jid = currentChatJid;

  if (!token) {
    alert("❌ Você não está logado");
    return;
  }

  if (!jid) {
    alert("❌ Nenhuma conversa aberta");
    return;
  }

  try {
    console.log(`📤 Enviando sticker da galeria: ${stickerName}`);

    // Busca o sticker e cria um blob
    const res = await fetch(stickerUrl);
    const blob = await res.blob();

    // Cria FormData
    const formData = new FormData();
    formData.append("sticker", blob, stickerName);
    formData.append("jid", jid);

    const sendRes = await fetch("/send-sticker", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const data = await sendRes.json();

    if (sendRes.ok) {
      console.log("✅ Sticker enviado com sucesso!");
      alert("✅ Sticker enviado!");

      // Renderiza o sticker
      renderMessage({
        type: "sticker",
        fromMe: true,
        messageId: data.message.messageId,
        status: "sent",
        timestamp: Date.now(),
        url: data.message.url,
        jid: jid,
      });

      // Rola para o fim
      scrollToBottom(true);
    } else {
      alert(`❌ Erro: ${data.error}`);
    }
  } catch (err) {
    console.error("❌ Erro ao enviar sticker:", err);
    alert("❌ Erro ao enviar sticker.");
  }
}

// ===== SALVAR STICKER RECEBIDO =====
async function saveReceivedSticker(stickerUrl, messageId) {
  const token = getToken();

  if (!token) {
    console.warn("❌ Você não está logado");
    return false;
  }

  try {
    // Verifica se já está salvo (usando hash)
    const inFavorites = await isStickerInFavorites(stickerUrl);
    if (inFavorites) {
      alert("⚠️ Este sticker já está salvo nos favoritos!");
      return false;
    }

    console.log(`💾 Salvando sticker: ${stickerUrl}`);

    // Busca o sticker
    const res = await fetch(stickerUrl);
    const blob = await res.blob();

    // Cria FormData
    const formData = new FormData();
    formData.append("sticker", blob, `sticker-${messageId}.webp`);
    formData.append("messageId", messageId);

    const saveRes = await fetch("/save-sticker", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const data = await saveRes.json();

    if (saveRes.ok) {
      console.log("✅ Sticker salvo com sucesso!");
      // Adiciona aos favoritos locais (sem duplicatas)
      const success = await addStickerToFavorites(
        data.url || stickerUrl,
        `sticker-${messageId}.webp`
      );
      if (success) {
        alert("✅ Sticker salvo! 📌");
      }
      return true;
    } else {
      console.warn(`⚠️ Erro ao salvar: ${data.error}`);
      return false;
    }
  } catch (err) {
    console.error("❌ Erro ao salvar sticker:", err);
    return false;
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
    if (msg.fromMe && sentThisSession.includes(msg.messageId)) return;

    const time = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    if (msg.type === "sticker") {
      const div = document.createElement("div");
      div.id = msg.messageId;
      div.className = `msg ${msg.fromMe ? "me" : "client"}`;

      const stickerWrapper = document.createElement("div");
      stickerWrapper.className = "sticker-wrapper";
      stickerWrapper.style.cssText = `
        position: relative;
        display: inline-block;
        margin-bottom: 0.5em;
        cursor: context-menu;
      `;

      const img = document.createElement("img");
      img.className = "sticker-img";
      img.src = msg.url;
      img.alt = "figurinha";
      img.style.cssText = `
        width: 70%;
        height: auto;
        border-radius: 0.5em;
        display: block;
      `;
      img.onerror = () => {
        img.src = "/images/sticker-fallback.png";
      };

      stickerWrapper.appendChild(img);

      // Evento de contexto
      stickerWrapper.addEventListener("contextmenu", (e) => {
        showContextMenu(e, msg.messageId, true, msg.fromMe);
      });

      const infoContainer = document.createElement("div");
      infoContainer.className = `msg-info ${msg.fromMe ? "" : "client"}`;
      infoContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 0.5em;
        margin-top: 0.3em;
      `;

      const statusInfoWrapper = document.createElement("div");
      statusInfoWrapper.style.cssText = `
        background-color: #3e5641;
        padding: 8px;
        padding-left: 0;
        border-radius: 1em;
        display: flex;
        gap: 0.5em;
        position: relative;
        left: 1.9em;
        align-items: center;
      `;

      const hourEl = document.createElement("p");
      hourEl.textContent = time;
      hourEl.className = `msg-hour sticker ${msg.fromMe ? "" : "client"}`;
      hourEl.style.cssText = `
        margin: 0;
        top: unset;
        left: 0.7em;
      `;
      statusInfoWrapper.appendChild(hourEl);

      if (msg.fromMe && msg.status) {
        const statusEl = document.createElement("img");
        statusEl.className = "msg-status";
        statusEl.src = `../images/${msg.status}.png`;
        statusEl.style.cssText = `
          font-size: 0.9em;
          color: #8f8f8f;
          margin: 0;
          left: 0.23em;
          top: unset;
        `;
        statusInfoWrapper.appendChild(statusEl);
      }

      infoContainer.appendChild(statusInfoWrapper);

      if (!msg.fromMe) {
        const saveBtn = document.createElement("button");
        saveBtn.textContent = "💾";
        saveBtn.style.cssText = `
          font-size: 0.8em;
          padding: 2px 6px;
          border-radius: 4px;
          border: 1px solid #999;
          background: #f0f0f0;
          cursor: pointer;
          transition: all 0.2s ease;
        `;
        saveBtn.onclick = () => saveReceivedSticker(msg.url, msg.messageId);
        infoContainer.appendChild(saveBtn);
      }

      div.appendChild(stickerWrapper);
      div.appendChild(infoContainer);
      chatContainer.appendChild(div);
      return;
    }

    const div = document.createElement("div");
    div.id = msg.messageId;
    div.className = msg.fromMe ? "msg-bubble" : "msg-bubble client";
    div.style.cursor = "context-menu";

    // Evento de contexto para mensagens de texto
    div.addEventListener("contextmenu", (e) => {
      showContextMenu(e, msg.messageId, false, msg.fromMe);
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

// Criar elemento de menu contexto
function createContextMenu() {
  if (document.getElementById("context-menu")) return;

  const menu = document.createElement("div");
  menu.id = "context-menu";
  menu.className = "context-menu";
  menu.style.cssText = `
    position: fixed;
    background: white;
    border: 1px solid #ddd;
    border-radius: 0.5em;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    z-index: 10000;
    display: none;
    min-width: 180px;
    padding: 0.5em 0;
  `;

  document.body.appendChild(menu);
}

// Adicionar item ao menu contexto
function addContextMenuItem(menu, label, icon, callback, divider = false) {
  const item = document.createElement("div");
  item.className = "context-menu-item";
  item.style.cssText = `
    padding: 0.6em 1em;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5em;
    font-size: 0.9em;
    border-bottom: ${divider ? "1px solid #eee" : "none"};
    transition: background 0.2s ease;
  `;

  item.innerHTML = `<span style="min-width: 18px;">${icon}</span><span>${label}</span>`;

  item.addEventListener("mouseenter", () => {
    item.style.background = "#f0f0f0";
  });

  item.addEventListener("mouseleave", () => {
    item.style.background = "transparent";
  });

  item.addEventListener("click", () => {
    callback();
    menu.style.display = "none";
  });

  menu.appendChild(item);
}

// Mostrar menu contexto
function showContextMenu(e, messageId, isSticker = false, isFromMe = false) {
  e.preventDefault();
  e.stopPropagation();

  createContextMenu();
  const menu = document.getElementById("context-menu");

  // Limpar itens anteriores
  menu.innerHTML = "";

  // ===== AÇÕES PARA STICKERS =====
  if (isSticker) {
    addContextMenuItem(menu, "Favoritar", "⭐", async () => {
      const msgDiv = document.getElementById(messageId);
      if (!msgDiv) return;

      const stickerUrl = msgDiv.querySelector(".sticker-img")?.src;
      if (stickerUrl) {
        const success = await saveReceivedSticker(stickerUrl, messageId);
        if (success) {
          showNotification("✅ Sticker adicionado aos favoritos!");
        }
      }
    });

    addContextMenuItem(
      menu,
      "Copiar",
      "📋",
      async () => {
        const msgDiv = document.getElementById(messageId);
        if (!msgDiv) return;

        const img = msgDiv.querySelector(".sticker-img");
        if (img) {
          try {
            const response = await fetch(img.src);
            const blob = await response.blob();
            await navigator.clipboard.write([
              new ClipboardItem({ "image/png": blob }),
            ]);
            showNotification("✅ Sticker copiado!");
          } catch (err) {
            console.error("Erro ao copiar:", err);
          }
        }
      },
      true
    );
  } else {
    // ===== AÇÕES PARA TEXTO =====
    addContextMenuItem(menu, "Copiar", "📋", () => {
      const msgDiv = document.getElementById(messageId);
      if (msgDiv) {
        const textEl = msgDiv.querySelector(".msg-bubble-text");
        if (textEl) {
          const text = textEl.textContent;
          navigator.clipboard.writeText(text).then(() => {
            showNotification("✅ Copiado!");
          });
        }
      }
    });

    addContextMenuItem(menu, "Responder", "↩️", () => {
      const msgDiv = document.getElementById(messageId);
      if (msgDiv) {
        const textEl = msgDiv.querySelector(".msg-bubble-text");
        if (textEl) {
          const text = textEl.textContent;
          const input = document.getElementById("text");
          if (input) {
            input.value = `> ${text}\n`;
            input.focus();
          }
        }
      }
    });
  }

  // ===== AÇÕES PARA MENSAGENS ENVIADAS =====
  if (isFromMe) {
    addContextMenuItem(
      menu,
      "Editar",
      "✏️",
      () => {
        const msgDiv = document.getElementById(messageId);
        if (msgDiv) {
          const textEl = msgDiv.querySelector(".msg-bubble-text");
          if (textEl) {
            const text = textEl.textContent;
            const input = document.getElementById("text");
            if (input) {
              input.value = text;
              input.focus();
              // Marca como em edição
              input.dataset.editingId = messageId;
              showNotification("⚠️ Modo de edição ativo");
            }
          }
        }
      },
      true
    );

    addContextMenuItem(menu, "Deletar", "🗑️", async () => {
      if (confirm("Tem certeza que deseja deletar esta mensagem?")) {
        // TODO: Implementar exclusão no backend
        const msgDiv = document.getElementById(messageId);
        if (msgDiv) {
          msgDiv.style.opacity = "0.5";
          msgDiv.style.textDecoration = "line-through";
          showNotification("✅ Mensagem deletada!");
        }
      }
    });
  } else {
    // ===== AÇÕES PARA MENSAGENS RECEBIDAS =====
    if (!isSticker) {
      addContextMenuItem(
        menu,
        "Responder",
        "↩️",
        () => {
          const msgDiv = document.getElementById(messageId);
          if (msgDiv) {
            const textEl = msgDiv.querySelector(".msg-bubble-text");
            if (textEl) {
              const text = textEl.textContent;
              const input = document.getElementById("text");
              if (input) {
                input.value = `> ${text}\n`;
                input.focus();
              }
            }
          }
        },
        true
      );
    }
  }

  // ===== AÇÕES GERAIS =====
  if (!isSticker) {
    addContextMenuItem(menu, "Favoritar", "❤️", () => {
      const msgDiv = document.getElementById(messageId);
      if (msgDiv) {
        msgDiv.style.background =
          msgDiv.style.background === "rgb(255, 250, 205)" ? "" : "#fffacd";
        showNotification("❤️ Mensagem favoritada!");
      }
    });
  }

  // Posicionar menu
  menu.style.display = "block";
  menu.style.left = e.pageX + "px";
  menu.style.top = e.pageY + "px";

  // Ajustar se sair da tela
  setTimeout(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = window.innerWidth - rect.width - 10 + "px";
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = window.innerHeight - rect.height - 10 + "px";
    }
  }, 0);
}

// ===== MENU DE CONTEXTO PARA STICKERS FAVORITADOS =====
function showStickerContextMenu(e, stickerUrl, stickerDiv) {
  e.preventDefault();
  e.stopPropagation();

  createContextMenu();
  const menu = document.getElementById("context-menu");
  menu.innerHTML = "";

  // Opção de enviar
  addContextMenuItem(menu, "Enviar", "📤", async () => {
    // Pega o nome do sticker
    const nameEl = stickerDiv.querySelector(".sticker-item-name");
    const name = nameEl ? nameEl.textContent : "figurinha";
    await sendStickerFromFile(stickerUrl, name);
  });

  // Opção de copiar
  addContextMenuItem(menu, "Copiar", "📋", async () => {
    try {
      const response = await fetch(stickerUrl);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      showNotification("✅ Sticker copiado!");
    } catch (err) {
      console.error("Erro ao copiar:", err);
      showNotification("❌ Erro ao copiar!");
    }
  });

  // Opção de desfavoritar
  addContextMenuItem(menu, "Desfavoritar", "🗑️", async () => {
    console.log("🔍 Iniciando remoção de:", stickerUrl);
    const success = removeStickerFromFavorites(stickerUrl);
    console.log("🔍 Resultado da remoção:", success);

    if (success) {
      stickerDiv.style.opacity = "0.5";
      stickerDiv.style.pointerEvents = "none";
      showNotification("✅ Sticker removido dos favoritos!");
      setTimeout(() => {
        console.log("🔄 Recarregando galeria...");
        loadSavedStickers(); // Recarrega a lista
      }, 500);
    } else {
      showNotification("❌ Erro ao remover sticker!");
    }
  });

  // Posicionar menu
  menu.style.display = "block";
  menu.style.left = e.pageX + "px";
  menu.style.top = e.pageY + "px";

  // Ajustar se sair da tela
  setTimeout(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = window.innerWidth - rect.width - 10 + "px";
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = window.innerHeight - rect.height - 10 + "px";
    }
  }, 0);
}

// Fechar menu contexto ao clicar em outro lugar
document.addEventListener("click", () => {
  const menu = document.getElementById("context-menu");
  if (menu) menu.style.display = "none";
});

// Notificação temporária
function showNotification(message) {
  const notification = document.createElement("div");
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #333;
    color: white;
    padding: 1em;
    border-radius: 0.5em;
    z-index: 10001;
    animation: slideIn 0.3s ease;
  `;
  notification.textContent = message;

  // Adicionar animação
  const style = document.createElement("style");
  if (!document.querySelector("style[data-notification]")) {
    style.setAttribute("data-notification", "true");
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(400px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(400px); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = "slideOut 0.3s ease";
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}

// ===== RENDERIZAR MENSAGEM ÚNICA - CORRIGIDA =====
function renderMessage(msg) {
  if (!msg || !msg.jid) return;
  const chatContainer = document.getElementById("chat-history");
  if (!chatContainer) return;

  if (document.getElementById(msg.messageId)) return;

  if (msg.type === "sticker") {
    const msgDiv = document.createElement("div");
    msgDiv.id = msg.messageId;
    msgDiv.className = `msg ${msg.fromMe ? "me" : "client"}`;

    const stickerContainer = document.createElement("div");
    stickerContainer.className = "sticker-wrapper";
    stickerContainer.style.cssText = `
      position: relative;
      display: inline-block;
      margin-bottom: 0.5em;
      cursor: context-menu;
    `;

    const stickerImg = document.createElement("img");
    stickerImg.src = msg.url;
    stickerImg.alt = "figurinha";
    stickerImg.className = "sticker-img";
    stickerImg.style.cssText = `
      width: 70%;
      height: auto;
      border-radius: 0.5em;
      display: block;
      position: relative;
      left: 4em;
    `;
    stickerImg.onerror = () => {
      stickerImg.src = "/images/sticker-fallback.png";
    };

    stickerContainer.appendChild(stickerImg);

    // Evento de contexto
    stickerContainer.addEventListener("contextmenu", (e) => {
      showContextMenu(e, msg.messageId, true, msg.fromMe);
    });

    if (!msg.fromMe) {
      const saveBtn = document.createElement("button");
      saveBtn.className = "sticker-save-btn";
      saveBtn.innerHTML = "📌";
      saveBtn.style.cssText = `
        position: absolute;
        bottom: 5px;
        right: 5px;
        padding: 4px 8px;
        background-color: #4CAF50;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 11px;
        display: none;
        transition: all 0.2s ease;
      `;
      saveBtn.onclick = async () => {
        saveBtn.disabled = true;
        const success = await saveReceivedSticker(msg.url, msg.messageId);
        if (success) {
          saveBtn.textContent = "✅";
          setTimeout(() => {
            saveBtn.textContent = "📌";
            saveBtn.disabled = false;
          }, 2000);
        }
      };

      stickerContainer.appendChild(saveBtn);

      stickerContainer.onmouseover = () => {
        saveBtn.style.display = "block";
      };
      stickerContainer.onmouseout = () => {
        saveBtn.style.display = "none";
      };
    }

    msgDiv.appendChild(stickerContainer);

    const infoContainer = document.createElement("div");
    infoContainer.className = `msg-info ${msg.fromMe ? "" : "client"}`;
    infoContainer.style.cssText = `
      display: flex;
      align-items: center;
      gap: 0.5em;
      margin-top: 0.3em;
    `;

    // Definir time aqui
    const time = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const statusInfoWrapper = document.createElement("div");
    statusInfoWrapper.style.cssText = `
      background-color: #3e5641;
      padding: 8px;
      padding-left: 0;
      border-radius: 0.8em;
      display: flex;
      gap: 0.5em;
      align-items: center;
      position: relative;
      left: 1.9em;
    `;

    const hourEl = document.createElement("p");
    hourEl.className = `msg-hour sticker ${msg.fromMe ? "" : "client"}`;
    hourEl.textContent = time;
    hourEl.style.cssText = `
      margin: 0;
      top: unset;
      left: 0.7em;
    `;
    statusInfoWrapper.appendChild(hourEl);

    if (msg.fromMe && msg.status) {
      const statusSpan = document.createElement("img");
      statusSpan.className = "msg-status";
      statusSpan.src = `../images/${msg.status}.png`;
      statusSpan.style.cssText = `
        font-size: 0.9em;
        color: #8f8f8f;
        margin: 0;
        top: unset;
        left: 0.23em;
      `;
      statusInfoWrapper.appendChild(statusSpan);
    }

    infoContainer.appendChild(statusInfoWrapper);
    msgDiv.appendChild(infoContainer);

    chatContainer.appendChild(msgDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    return;
  }

  const div = document.createElement("div");
  div.id = msg.messageId;
  div.className = msg.fromMe ? "msg-bubble" : "msg-bubble client";
  div.style.cursor = "context-menu";

  const time = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  // Evento de contexto
  div.addEventListener("contextmenu", (e) => {
    showContextMenu(e, msg.messageId, false, msg.fromMe);
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
  setTimeout(() => {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }, 50);
}

// Formata asteriscos em <strong>
function formatarAsteriscos(texto) {
  if (!texto || typeof texto !== "string") return "";
  return texto.replace(/\*([^*]+)\*/g, "<strong>$1</strong><br>");
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
      <button class="configbtn green add" id="save-contact-btn" onclick="saveContactFromChat('${jid}')">Salvar contato</button>
      <button class="configbtn red remove" id="delete-contact-btn" onclick="deleteContact('${jid}')">Deletar contato</button>
      <button id="delete-conv" class="configbtn delete" onclick="deleteConversation('${jid}')">Deletar conversa</button>
    `;
    if (header) header.style.visibility = "hidden";
    if (more) more.style.display = "block";
    if (button) {
      button.style.visibility = "visible";
      button.classList.add("opened");
    }
    // Após criar os botões, verifica e toggle o botão de contato
    checkAndToggleSaveContactButton(jid);
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

    // Backend já retorna número ou nome salvo
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

// ===== ABRIR / FECHAR ADIÇÃO =====
var addBlockOpen = false;
function openAdd() {
  const addButton = document.getElementById("add-menu");
  if (!addButton) return;
  if (!addBlockOpen) {
    addButton.style.display = "block";
    addBlockOpen = true;
  } else {
    addButton.style.display = "none";
    addBlockOpen = false;
  }
}

// ===== ADICIONAR CONTATO =====
async function addContact() {
  const nameInput = document.getElementById("add-name");
  const numberInput = document.getElementById("add-number");

  if (!nameInput || !numberInput) return;

  const name = nameInput.value.trim();
  const number = numberInput.value.trim();

  // Validações
  if (!name || !number) {
    alert("Por favor, preencha nome e número");
    return;
  }

  const token = getToken();
  if (!token) {
    alert("Você não está logado");
    return;
  }

  try {
    const res = await fetch("/contacts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name, number }),
    });

    const data = await res.json();

    if (res.ok) {
      alert(`✅ Contato "${name}" adicionado com sucesso!`);
      // Limpa os campos
      nameInput.value = "";
      numberInput.value = "";
      // Habilita o campo de número novamente
      numberInput.disabled = false;
      // Fecha o menu de adicionar contato
      openAdd();
      // Fecha o menu de mais opções (more-chat)
      if (moreOpened) {
        expandContact();
      }
      // Atualiza a lista de conversas
      fetchConversations();
      // Verifica se precisa esconder o botão de salvar contato
      checkAndToggleSaveContactButton(currentChatJid);
    } else {
      alert(`❌ Erro: ${data.error || "Não foi possível adicionar o contato"}`);
    }
  } catch (err) {
    console.error("Erro ao adicionar contato:", err);
    alert("❌ Erro ao adicionar contato. Tente novamente.");
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
