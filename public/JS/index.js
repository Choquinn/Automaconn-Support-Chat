let currentTab = 1;
let currentChat = null;
// ===== Alternar abas =====
function changeTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".menu-header-options").forEach((el, i) => {
    el.classList.toggle("selected", i === tab - 1);
  });
  fetchConversations();
}

async function waitForConnection() {
  const qrContainer = document.getElementById("qr");

  while (true) {
    try {
      // 1️⃣ Buscar status do bot
      const statusRes = await fetch("/status");
      const { status } = await statusRes.json();

      if (status === "conectado") {
        // Redireciona assim que estiver conectado
        window.location.href = "index.html";
        return;
      }

      // 2️⃣ Buscar QR code
      const qrRes = await fetch("/qr");
      if (qrRes.ok) {
        const { qr } = await qrRes.json();
        const qrImage = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qr)}`;
        qrContainer.innerHTML = `<img src="${qrImage}" alt="QR Code">`;
      } else {
        qrContainer.innerHTML = "<p>QR ainda não disponível...</p>";
      }

    } catch (err) {
      console.error("Erro ao buscar status ou QR:", err);
    }

    // 3️⃣ Espera 2 segundos antes de checar novamente
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

// Inicia a função
// waitForConnection();
 
async function quitSession(){
    await fetch("/exit");
}

// ===== Buscar conversas =====
async function fetchConversations() {
  const res = await fetch("/conversations");
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

    const lastMsg = c.messages.slice(-1)[0]?.text || "";

    div.innerHTML = `
      <img class="user-pfp" src="${c.img || 'https://i.pinimg.com/736x/2f/15/f2/2f15f2e8c688b3120d3d26467b06330c.jpg'}" />
      <h2 class="client-name">${c.name}</h2>
      <p class="latest-msg">${lastMsg}</p>
    `;

    createStatusButtons(c);

    div.addEventListener("click", () => {
      currentChat = c.jid;
      openChat(c.jid);
    });

    container.appendChild(div);
  });
}

// ===== Atualizar status =====
async function updateStatus(jid, status) {
  await fetch(`/conversations/${jid}/status`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  });
  fetchConversations();
}

// ===== Abrir chat =====
async function openChat(jid) {
  const res = await fetch(`/conversations/${jid}`);
  const conv = await res.json();

  // Header
  document.querySelector("#chat-header .client-name").textContent = conv.name;
  document.querySelector("#chat-header .user-pfp").src = conv.img || 'https://i.pinimg.com/736x/2f/15/f2/2f15f2e8c688b3120d3d26467b06330c.jpg';

  // Mensagens
  const chatBlock = document.getElementById("chat-history");
  chatBlock.innerHTML = "";

  conv.messages.forEach(m => {
    const div = document.createElement("div");
    div.className = m.fromMe ? "msg-bubble" : "msg-bubble client";
    const time = new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    div.innerHTML = `
      <p class="msg-bubble-text">${m.text}</p>
      <p class="msg-hour ${m.fromMe ? "" : "client"}">${time}</p>
    `;
    chatBlock.appendChild(div);
  });

  chatBlock.scrollTop = chatBlock.scrollHeight;
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

function createStatusButtons(c){
  document.getElementById("status-buttons").innerHTML = `
    <button id="ativar" onclick="updateStatus('${c.jid}', 'active')">Ativar</button>
    <button id="fila" onclick="updateStatus('${c.jid}', 'queue')">Fila</button>
    <button id="fechar" onclick="updateStatus('${c.jid}', 'closed')">Fechar</button>
`;
}

// ===== Atualizações automáticas =====
setInterval(fetchConversations, 2000);
setInterval(() => { if(currentChat) openChat(currentChat); }, 1000);

// Inicializa
fetchConversations();