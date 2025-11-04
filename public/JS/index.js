// ===== CONSTANTES E VARIÁVEIS GLOBAIS =====
const deleteButton = document.getElementById("deleteBtn");
const addButton = document.getElementById("addBtn");
const textInput = document.getElementById("text");
const callButton = document.getElementById("chamada-sym");
const imageCache = {};
let currentTab = 1;
let currentChat = null;
let chatHeaderCache = {};
let lastMessageCountMap = {};
let isLoading = true;

// Variáveis de roles
var sup = false;
var trein = false;
var vend = false;
var at = false;
var admin = false;

// ===== FUNÇÕES DE TOKEN (sem localStorage) =====
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

// ===== INICIALIZAÇÃO =====
async function initializeApp() {
  showLoading();
  
  const token = getToken();
  if (!token) {
    window.location.href = "/login.html";
    return;
  }

  try {
    // Checa roles do usuário
    await checkUserRoles(token);
    
    // Checa conexão
    await checkConnection();
    
    // Carrega conversas iniciais
    await fetchConversations();
    
    // Pré-carrega imagens das conversas visíveis
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
      headers: { Authorization: `Bearer ${token}` }
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
      deleteButton.style.display = 'block';
      addButton.style.display = 'block';
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
    const { status } = await statusRes.json();

    if (status !== "conectado") {
      window.location.href = "/connect.html";
    }
  } catch (error) {
    console.error("Erro ao verificar conexão:", error);
    window.location.href = "/connect.html";
  }
}

// ===== PRÉ-CARREGAMENTO DE IMAGENS =====
async function preloadVisibleImages() {
  const visibleChats = document.querySelectorAll(".menu-chats");
  const promises = [];
  
  visibleChats.forEach((chatDiv) => {
    const jid = chatDiv.getAttribute("data-jid");
    if (jid) {
      promises.push(updateProfilePicture(jid));
    }
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
// Inicializa o listener apenas uma vez
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

// ===== ADICIONAR USUÁRIO =====
async function addUser() {
  const token = getToken();
  if (!token) return;

  if (admin) {
    window.location.href = "/register.html";
  } else {
    alert("Você não tem permissão para fazer essa ação");
  }
}

// ===== DELETAR USUÁRIO - MENU =====
async function deleteMenu() {
  const deleteMenuEl = document.getElementById("delete-menu");
  const res = await fetch("/users");
  const users = await res.json();
  const div = document.getElementById("delete-options");

  deleteMenuEl.style.display = 'block';
  div.innerHTML = '';
  
  users.forEach((u) => {
    div.innerHTML += `<option value="${u.number}">${u.username}</option>`;
  });
}

// ===== DELETAR USUÁRIO =====
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
    headers: { Authorization: `Bearer ${token}` } 
  });
  const me = await meRes.json();
  
  if (!me.role.includes(5)) {
    alert("Você não tem permissão para fazer essa ação");
    return;
  }

  const userRes = await fetch(`/user-id/${userNumber}`, { 
    headers: { Authorization: `Bearer ${token}` }
  });
  const userData = await userRes.json();

  if (!userData.success) {
    alert("Usuário não encontrado");
    return;
  }

  const res = await fetch(`/users/${userData.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
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
  const token = getToken();
  
  if (!token) {
    alert("Você não está logado");
    return;
  }

  const meRes = await fetch("/me", { 
    headers: { Authorization: `Bearer ${token}` } 
  });
  const me = await meRes.json();

  const convRes = await fetch(`/conversation-id/${jid}`, { 
    headers: { Authorization: `Bearer ${token}` }
  });
  const convData = await convRes.json();

  if (!convData.success) {
    alert("Conversa não encontrada");
    return;
  }

  const res = await fetch(`/conversations/${convData.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });

  if (res.ok) {
    alert("Conversa deletada com sucesso");
    fetchConversations();
    document.getElementById("chat").style.display = "none";
    currentChat = null;
  } else {
    const err = await res.json();
    alert("Erro ao deletar essa conversa: " + (err.error || "Tente novamente"));
  }
}

// ===== CANCELAR DELETE =====
function cancelDelete() {
  const deleteMenuEl = document.getElementById("delete-menu");
  deleteMenuEl.style.display = 'none';
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
    chatEl.style.display = "none";
  } else {
    chatEl.style.display = "flex";
  }
}

// ===== ATUALIZAR FOTO DE PERFIL =====
async function updateProfilePicture(jid) {
  try {
    const imgEl = document.querySelector(`img[data-jid="${jid}"]`);
    if (!imgEl) return;

    const cacheEntry = imageCache[jid];
    const cacheValid = cacheEntry && (Date.now() - cacheEntry.timestamp < 60 * 60 * 1000);

    if (cacheValid && imgEl.src.includes(cacheEntry.url)) {
      return;
    }

    const res = await fetch(`/update-profile-picture/${jid}`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });

    if (res.status === 204) {
      imgEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(jid)}&background=random`;
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
      headers: { "Authorization": "Bearer " + token }
    });

    if (!res.ok) throw new Error("Erro ao buscar conversas");
    const data = await res.json();

    const container = document.getElementById("menu-chat-block");
    const existingChats = {};

    container.querySelectorAll(".menu-chats").forEach(div => {
      existingChats[div.getAttribute("data-jid")] = div;
    });

    let filtered = [];
    if (currentTab === 1) filtered = data.filter(c => c.status === "active");
    if (currentTab === 2) filtered = data.filter(c => c.status === "queue");
    if (currentTab === 3) filtered = data.filter(c => c.status === "closed");

    for (const c of filtered) {
      let div = existingChats[c.jid];

      if (!div) {
        div = document.createElement("div");
        div.className = "menu-chats";
        div.setAttribute("data-jid", c.jid);
        div.innerHTML = `
          <img class="user-pfp" data-jid="${c.jid}" 
            src="${c.img || `/profile-pics/${encodeURIComponent(c.jid)}.jpg`}" />
          <h2 class="client-name"></h2>
          <p class="latest-msg"></p>
        `;
        container.appendChild(div);

        div.addEventListener("click", () => {
          currentChat = c.jid;
          openChat(c.jid);
          document.querySelectorAll(".menu-chats").forEach(el => el.classList.remove("selected"));
          div.classList.add("selected");
          checkChat();
        });
      }

      div.querySelector(".client-name").textContent = c.name;
      div.querySelector(".latest-msg").textContent = c.messages.slice(-1)[0]?.text || "";

      if (currentChat === c.jid) {
        div.classList.add("selected");
      } else {
        div.classList.remove("selected");
      }

      safeUpdateProfilePicture(c.jid);
    }

    Object.keys(existingChats).forEach(jid => {
      if (!filtered.find(c => c.jid === jid)) {
        existingChats[jid].remove();
      }
    });

  } catch (err) {
    console.error("Erro ao buscar conversas:", err);
  }
}

// ===== RENDERIZAR BOTÕES DE STATUS =====
function renderStatusButtons(c) {
  const statusContainer = document.getElementById("status-buttons");
  statusContainer.innerHTML = `
    <button id="ativar" onclick="updateStatus('${c.jid}', 'active')">Ativar</button>
    <button id="fila" onclick="updateStatus('${c.jid}', 'queue')">Fila</button>
    <button id="fechar" onclick="updateStatus('${c.jid}', 'closed')">Fechar</button>
  `;
}

function renderMessages(chatContainer, messages) {
  messages.forEach(msg => {
    // Evita duplicação
    if (!document.getElementById(msg.messageId)) {
      const div = document.createElement("div");
      div.id = msg.messageId;
      div.className = msg.fromMe ? "msg-bubble" : "msg-bubble client";
      const time = new Date(msg.timestamp).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
      div.innerHTML = `
        <p class="msg-bubble-text">${msg.text}</p>
        <p class="msg-hour ${msg.fromMe ? "" : "client"}">${time}</p>
      `;
      chatContainer.appendChild(div);
    }
  });
}

// ===== ATUALIZAR STATUS =====
async function updateStatus(jid, status) {
  await fetch(`/conversations/${jid}/status`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json", 
      "Authorization": "Bearer " + getToken() 
    },
    body: JSON.stringify({ status })
  });
  
  switch(status) {
    case 'active':
      changeTab(1);
      break;
    case 'queue':
      changeTab(2);
      break;
    case 'closed':
      changeTab(3);
      break;
  }
  fetchConversations();
}

// ===== SCROLL TO BOTTOM =====
function scrollToBottom(smooth = false) {
  const chatContainer = document.getElementById("chat-history");
  if (!chatContainer) return;
  
  if (smooth) {
    chatContainer.scrollTo({
      top: chatContainer.scrollHeight,
      behavior: 'smooth'
    });
  } else {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}

// ===== EXPANDIR CONTATO (CORRIGIDO) =====
var moreOpened = false;

function expandContact() {
  const more = document.getElementById("more-chat");
  const button = document.getElementById("mais-sym");
  const buttons = document.getElementById("more-buttons");
  const header = document.getElementById("chat-header");
  const div = document.querySelector(".menu-chats.selected");
  
  if (!div) return;
  
  const jid = div.getAttribute("data-jid");

  if (!moreOpened) {
    buttons.innerHTML = `
      <button id="delete-conv" class="configbtn delete" onclick="deleteConversation('${jid}')">Deletar conversa</button>
    `;
    header.style.visibility = "hidden";
    more.style.display = "block";
    button.style.visibility = "visible";
    button.classList.add("opened");
    moreOpened = true;
  } else {
    more.style.display = "none";
    header.style.visibility = "visible";
    button.classList.remove("opened");
    moreOpened = false;
  }
}

// ===== ABRIR CHAT =====
// async function openChat(jid) {
//   const token = getToken();
//   if (!token) return window.location.href = "/login.html";

//   const chatContainer = document.getElementById("chat-history");
//   const headerName = document.getElementById("client-name");
//   const headerImg = document.getElementById("pfp");

//   headerImg.setAttribute('data-jid', jid);

//   const cached = chatHeaderCache[jid];
//   if (cached) {
//     headerName.textContent = cached.name;
//     headerImg.src = cached.img;
//   } else {
//     headerName.textContent = "Carregando...";
//     const cachedImage = imageCache[jid];
//     if (cachedImage) {
//       headerImg.src = cachedImage.url;
//     } else {
//       headerImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(jid)}&background=random`;
//     }
//   }

//   try {
//     const res = await fetch(`/conversations/${encodeURIComponent(jid)}`, {
//       headers: { Authorization: `Bearer ${token}` }
//     });
//     if (!res.ok) throw new Error("Não foi possível carregar a conversa");

//     const data = await res.json();
//     headerName.textContent = data.name;
    
//     try {
//       const imgRes = await fetch(`/update-profile-picture/${jid}`, {
//         headers: { Authorization: `Bearer ${token}` }
//       });

//       if (imgRes.status === 204) {
//         headerImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name)}&background=random`;
//         imageCache[jid] = { url: headerImg.src, timestamp: Date.now() };
//       } else {
//         const contentType = imgRes.headers.get("content-type") || "";
//         let imgUrl;

//         if (contentType.includes("application/json")) {
//           const imgData = await imgRes.json();
//           imgUrl = imgData.img;
//         } else {
//           imgUrl = `/profile-pics/${encodeURIComponent(jid)}.jpg`;
//         }

//         headerImg.src = imgUrl;
//         imageCache[jid] = { url: imgUrl, timestamp: Date.now() };
//       }
//     } catch (imgErr) {
//       console.error("Erro ao carregar imagem:", imgErr);
//       headerImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name)}&background=random`;
//     }

//     chatHeaderCache[jid] = {
//       name: data.name,
//       img: headerImg.src
//     };

//     renderStatusButtons(data);

//     chatContainer.innerHTML = "";
//     const fragment = document.createDocumentFragment();

//     data.messages.forEach(msg => {
//       const div = document.createElement("div");
//       div.className = msg.fromMe ? "msg-bubble" : "msg-bubble client";
//       const time = new Date(msg.timestamp)
//         .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
//       div.innerHTML = `
//         <p class="msg-bubble-text">${msg.text}</p>
//         <p class="msg-hour ${msg.fromMe ? "" : "client"}">${time}</p>
//       `;
//       fragment.appendChild(div);
//     });

//     chatContainer.appendChild(fragment);
//     lastMessageCountMap[jid] = data.messages.length;

//     requestAnimationFrame(() => {
//       scrollToBottom(false);
//     });

//   } catch (err) {
//     console.error("Erro ao abrir conversa:", err);
//   }
// }

async function openChat(jid) {
  const token = getToken();
  if (!token) return window.location.href = "/login.html";

  const chatContainer = document.getElementById("chat-history");
  const headerName = document.getElementById("client-name");
  const headerImg = document.getElementById("pfp");

  headerImg.setAttribute('data-jid', jid);

  const cached = chatHeaderCache[jid];
  if (cached) {
    headerName.textContent = cached.name;
    headerImg.src = cached.img;
  } else {
    headerName.textContent = "Carregando...";
    const cachedImage = imageCache[jid];
    headerImg.src = cachedImage ? cachedImage.url : `https://ui-avatars.com/api/?name=${encodeURIComponent(jid)}&background=random`;
  }

  try {
    const res = await fetch(`/conversations/${encodeURIComponent(jid)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Não foi possível carregar a conversa");

    const data = await res.json();
    headerName.textContent = data.name;

    // Atualiza imagem
    try {
      const imgRes = await fetch(`/update-profile-picture/${jid}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      let imgUrl;

      if (imgRes.status === 204) {
        imgUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name)}&background=random`;
      } else {
        const contentType = imgRes.headers.get("content-type") || "";
        imgUrl = contentType.includes("application/json") ? (await imgRes.json()).img : `/profile-pics/${encodeURIComponent(jid)}.jpg`;
      }

      headerImg.src = imgUrl;
      imageCache[jid] = { url: imgUrl, timestamp: Date.now() };
    } catch {
      headerImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name)}&background=random`;
    }

    chatHeaderCache[jid] = { name: data.name, img: headerImg.src };
    renderStatusButtons(data);

    // Renderiza mensagens
    chatContainer.innerHTML = "";
    renderMessages(chatContainer, data.messages);
    lastMessageCountMap[jid] = data.messages.length;

    requestAnimationFrame(() => scrollToBottom(false));

  } catch (err) {
    console.error("Erro ao abrir conversa:", err);
  }
}

// ===== ATUALIZAR CHAT =====
// async function updateChat(jid) {
//   const token = getToken();
//   if (!token) return;

//   const chatContainer = document.getElementById("chat-history");
//   if (!chatContainer) return;

//   try {
//     const res = await fetch(`/conversations/${encodeURIComponent(jid)}`, {
//       headers: { Authorization: `Bearer ${token}` }
//     });
//     if (!res.ok) return;

//     const data = await res.json();
//     if (!data.messages || !Array.isArray(data.messages)) return;

//     const lastMessageCount = lastMessageCountMap[jid] || 0;
//     if (data.messages.length > lastMessageCount) {
//       const newMessages = data.messages.slice(lastMessageCount);

//       const isNearBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight < 100;

//       newMessages.forEach(msg => {
//         const div = document.createElement("div");
//         div.className = msg.fromMe ? "msg-bubble" : "msg-bubble client";
//         const time = new Date(msg.timestamp).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
//         div.innerHTML = `
//           <p class="msg-bubble-text">${msg.text}</p>
//           <p class="msg-hour ${msg.fromMe ? "" : "client"}">${time}</p>
//         `;
//         chatContainer.appendChild(div);
//       });

//       if (isNearBottom) {
//         scrollToBottom(true);
//         setTimeout(() => scrollToBottom(true), 50);
//       }

//       lastMessageCountMap[jid] = data.messages.length;
//     }

//   } catch (err) {
//     console.error("Erro ao atualizar chat:", err);
//   }
// }

async function updateChat(jid) {
  const token = getToken();
  if (!token) return;

  const chatContainer = document.getElementById("chat-history");
  if (!chatContainer) return;

  try {
    const res = await fetch(`/conversations/${encodeURIComponent(jid)}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return;

    const data = await res.json();
    if (!data.messages || !Array.isArray(data.messages)) return;

    const lastMessageCount = lastMessageCountMap[jid] || 0;
    const newMessages = data.messages.slice(lastMessageCount);

    if (newMessages.length > 0) {
      renderMessages(chatContainer, newMessages);

      const isNearBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight < 100;
      if (isNearBottom) scrollToBottom(true);

      lastMessageCountMap[jid] = data.messages.length;
    }
  } catch (err) {
    console.error("Erro ao atualizar chat:", err);
  }
}

// ===== ABRIR CONFIGURAÇÕES =====
var settingsOpen = false;

function openSettings() {
  const configButton = document.getElementById("config-menu");

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
  const jid = currentChat;
  const text = document.getElementById("text").value.trim();

  if (!jid) return alert("Selecione uma conversa primeiro");
  if (!text) return;

  try {
    const res = await fetch("/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getToken()}`
      },
      body: JSON.stringify({ jid, text })
    });

    const data = await res.json();
    if (data.success) {
      // Adiciona a mensagem no chat imediatamente
      const chatContainer = document.getElementById("chat-history");
      const div = document.createElement("div");
      div.className = "msg-bubble";
      const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      div.innerHTML = `<p class="msg-bubble-text">${text}</p>
                       <p class="msg-hour">${time}</p>`;
      chatContainer.appendChild(div);
      scrollToBottom(true);
      document.getElementById("text").value = "";
    } else {
      alert("Erro ao enviar mensagem: " + (data.error || "Tente novamente"));
    }
  } catch (err) {
    console.error(err);
    alert("Erro ao enviar mensagem. Veja o console.");
  }
}

textInput.addEventListener("keypress", async (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    await sendMessage();
  }
});

// ===== CHAMADAS =====
callButton.addEventListener("click", () => {
  if (!currentChat) return alert("Selecione um contato primeiro");
  // Se o JID tiver o número, podemos extrair
  const number = currentChat.split("@")[0];
  window.location.href = `tel:${number}`;
});

// ===== ATUALIZAÇÕES AUTOMÁTICAS =====
setInterval(fetchConversations, 2000);
setInterval(() => {
  if (currentChat) updateChat(currentChat);
}, 1000);

// ===== INICIALIZA A APLICAÇÃO =====
initializeApp();
checkChat();