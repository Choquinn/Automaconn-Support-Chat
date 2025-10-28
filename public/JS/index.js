const deleteButton = document.getElementById("deleteBtn");
const addButton = document.getElementById("addBtn");
let currentTab = 1;
let currentChat = null;
var sup = false;
var trein = false;
var vend = false;
var at = false;
var admin = false;

const token = localStorage.getItem("token") || sessionStorage.getItem("token");; // pega o token armazenado

async function checkUserRoles(token) {
    const res = await fetch("/me", {
        headers: { Authorization: `Bearer ${token}` }
    });
    const user = await res.json();

    // Exemplo: verificar area
    if (user.role.includes(1)) {
        sup = true;
    }
    if (user.role.includes(2)) {
        trein = true;
    }
    if (user.role.includes(3)) {
        vend = true;
    }
    if (user.role.includes(4)) {
        at = true;
    }
    if (user.role.includes(5)) {
        admin = true;
    }

    if (admin) {
      deleteButton.style.display = 'block';
      addButton.style.display = 'block';
    }
}

checkUserRoles(token);

// ===== Alternar abas =====
function changeTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".menu-header-options").forEach((el, i) => {
    el.classList.toggle("selected", i === tab - 1);
  });
  fetchConversations();
}

window.addEventListener("storage", (e) => {
  if (e.key === "token" && e.newValue === null) {
    // token removido em outra aba
    window.location.href = "/login.html";
  }
});

async function checkConnection() {
  const statusRes = await fetch("/status");
  const { status } = await statusRes.json();

  if (status === "conectado") {
    return; // para de checar
  }else {
    window.location.href = "/connect.html";
  }
}

checkConnection();
 
async function logout() {
  // Checa se o usuário está logado
  const token = localStorage.getItem("token") || sessionStorage.getItem("token");;
  if (!token) {
    window.location.href = "/login.html";
  }

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    try {
      // Opcional: avisar servidor sobre logout (não remove token do backend se você não implementar blacklist)
      await fetch("/logout", { method: "POST" }).catch(()=>{});
    } catch (e) {
      console.warn("erro no logout backend:", e);
    }

    // Remover o token exatamente da chave que usamos
    localStorage.removeItem("token");

    // Confirmação e redireciona para a tela de login
    window.location.href = "/login.html";
  });
}

async function addUser() {
  // Checa se o usuário está logado
  const token = localStorage.getItem("token") || sessionStorage.getItem("token");;
  if (!token) {
    return;
  }

  //Checa se o usuário é administrador
  if (admin){
    window.location.href = "/register.html";
  }else {
    alert("Você não tem permissão pra fazer essa ação");
  }

}

async function deleteMenu(){
  const deleteMenu = document.getElementById("delete-menu");
  const res = await fetch("/users");
  const users = await res.json();
  const div = document.getElementById("delete-options");

  deleteMenu.style.display = 'block';
  div.innerHTML = '';
  users.forEach((u) => {
    var name = u.username;
    var number = u.number;
    div.innerHTML += `
      <option value="${number}">${name}</option>
    `
  });
}

async function deleteUser() {
  const select = document.getElementById("delete-sel");
  const userNumber = select.value;

  if (!userNumber) {
    alert("Escolha um usuário para deletar");
    return;
  }

  const token = localStorage.getItem("token") || sessionStorage.getItem("token");;
  if (!token) {
    alert("Você não está logado");
    return;
  }

  // Checa se o usuário logado é admin
  const meRes = await fetch("/me", { headers: { Authorization: `Bearer ${token}` } });
  const me = await meRes.json();
  if (!me.role.includes(5)) { // 5 = Admin
    alert("Você não tem permissão pra fazer essa ação");
    return;
  }

  // Pega o _id do usuário selecionado via backend
  const userRes = await fetch(`/user-id/${userNumber}`, { 
    headers: { Authorization: `Bearer ${token}` }
  });
  const userData = await userRes.json();

  if (!userData.success) {
    alert("Usuário não encontrado");
    return;
  }

  const userId = userData.id;

  // Deleta o usuário
  const res = await fetch(`/users/${userId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });

  if (res.ok) {
    alert("Usuário deletado com sucesso");
    // Atualiza o menu
    populateDeleteMenu();
  } else {
    const err = await res.json();
    alert("Erro ao deletar usuário: " + (err.error || "Tente novamente"));
  }
}

async function cancelDelete() {
  const deleteMenu = document.getElementById("delete-menu");

  deleteMenu.style.display = 'none';
}

async function quitSession(){
    await fetch("/exit");
    checkConnection();
}

// ===== Buscar conversas =====
async function fetchConversations() {
  const token = localStorage.getItem("token") || sessionStorage.getItem("token");
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
    container.innerHTML = "";

    let filtered = [];
    if (currentTab === 1) filtered = data.filter(c => c.status === "active");
    if (currentTab === 2) filtered = data.filter(c => c.status === "queue");
    if (currentTab === 3) filtered = data.filter(c => c.status === "closed");

    filtered.forEach(c => {
      const div = document.createElement("div");
      div.className = "menu-chats";
      div.setAttribute("data-jid", c.jid);

      if (currentChat === c.jid) {
        div.classList.add("selected"); // mantém a conversa selecionada
      }


      const lastMsg = c.messages.slice(-1)[0]?.text || "";
      const imgSrc = c.img || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.name)}&background=random`;
      div.innerHTML = `
        <img class="user-pfp" src="${imgSrc}" />
        <h2 class="client-name">${c.name}</h2>
        <p class="latest-msg">${lastMsg}</p>
      `;

      div.addEventListener("click", () => {
        currentChat = c.jid;
        openChat(c.jid);

        setInterval(() => {
          const lastMsg = document.getElementById("chat-history").lastElementChild;
          if (lastMsg) {
            lastMsg.scrollIntoView({ block: "end" });
          }
        }, 50);
        document.querySelectorAll(".menu-chats").forEach(el => el.classList.remove("selected"));
        div.classList.add("selected");
      });

      container.appendChild(div);
    });

  } catch (err) {
    console.error("Erro ao buscar conversas:", err);
  }
}

function scrollToBottom() {
  const chatContainer = document.getElementById("chat-history");
  if (chatContainer) {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
}


function renderStatusButtons(c) {
  const statusContainer = document.getElementById("status-buttons");
  statusContainer.innerHTML = `
    <button id="ativar" onclick="updateStatus('${c.jid}', 'active')">Ativar</button>
    <button id="fila" onclick="updateStatus('${c.jid}', 'queue')">Fila</button>
    <button id="fechar" onclick="updateStatus('${c.jid}', 'closed')">Fechar</button>
  `;
}

// ===== Atualizar status =====
async function updateStatus(jid, status) {
  await fetch(`/conversations/${jid}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
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

// ===== Abrir chat =====
async function openChat(jid) {
  const token = localStorage.getItem("token") || sessionStorage.getItem("token");
  if (!token) {
    window.location.href = "/login.html";
    return;
  }

  try {
    // Busca a conversa
    const res = await fetch(`/conversations/${encodeURIComponent(jid)}`, {
      headers: { "Authorization": "Bearer " + token }
    });

    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem("token");
        sessionStorage.removeItem("token");
        window.location.href = "/login.html";
      }
      throw new Error("Não foi possível carregar a conversa");
    }

    let data = await res.json();

    // Se a imagem for vazia ou fallback, tenta atualizar do WhatsApp
    if (!data.img || data.img.includes("ui-avatars.com")) {
      try {
        const updatedImg = await fetch(`/update-profile-picture/${encodeURIComponent(jid)}`, {
          headers: { "Authorization": "Bearer " + token }
        }).then(r => r.json()).then(d => d.img).catch(() => data.img);
        data.img = updatedImg;
      } catch {
        // mantém fallback
      }
    }

    
    // Atualiza cabeçalho do chat
    document.querySelector("#chat-header .client-name").textContent = data.name;
    document.querySelector("#chat-header .user-pfp").src = data.img || `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name)}&background=random`;
    
    renderStatusButtons(data);

    // Verifica mensagens
    if (!data.messages || !Array.isArray(data.messages)) {
      console.error("Conversa inválida ou sem mensagens:", data);
      return;
    }

    // Renderiza mensagens
    const chatContainer = document.getElementById("chat-history");
    chatContainer.innerHTML = "";
    data.messages.forEach(msg => {
      const div = document.createElement("div");
      div.className = msg.fromMe ? "msg-bubble" : "msg-bubble client";
      const time = new Date(msg.timestamp).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });
      div.innerHTML = `
        <p class="msg-bubble-text">${msg.text}</p>
        <p class="msg-hour ${msg.fromMe ? "" : "client"}">${time}</p>
      `;
      chatContainer.appendChild(div);
    });

  } catch (err) {
    console.error("Erro ao abrir conversa:", err);
  }
}

var open = false;

function openSettings(){
  const configButton = document.getElementById("config-menu");

  if (!open){
    configButton.style.display = "block";
    open = true; 
  }else {
    configButton.style.display = "none";
    open = false;
  }
}

var statusOpen = false;

function openStatus(){
  const statusButton = document.getElementById("status-buttons");

  if (!statusOpen){
    statusButton.style.display = "flex";
    statusOpen = true; 
  }else {
    statusButton.style.display = "none";
    statusOpen = false;

  }

}

// ===== Atualizações automáticas =====
setInterval(fetchConversations, 2000);
setInterval(() => { if(currentChat) openChat(currentChat); }, 1000);

// Inicializa
fetchConversations();