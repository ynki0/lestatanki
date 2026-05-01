
// blyat























(() => {
  const socket = (typeof io === 'function') ? io() : null;
  if (!socket) return;

  const originalTitle = document.title;

  function chatTime(d) {
    try {
      return new Date(d).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  function escapeHtml(v) {
    return String(v ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function createMsgEl(msg) {
    const div = document.createElement('div');
    div.className = 'chat-msg ' + (msg?.sender || 'user');
    div.innerHTML = `${escapeHtml(msg?.text)}<span class="chat-time">${chatTime(msg?.created)}</span>`;
    return div;
  }

  let chatId = null;
  let chatOpen = false;
  let clientUnreadCount = 0;

  const chatToggle = document.getElementById('chatToggle');
  const chatWindow = document.getElementById('chatWindow');
  const chatClose = document.getElementById('chatClose');
  const chatEmailForm = document.getElementById('chatEmailForm');
  const chatEmailInput = document.getElementById('chatEmailInput');
  const chatEmailBtn = document.getElementById('chatEmailBtn');
  const chatBody = document.getElementById('chatBody');
  const chatMessages = document.getElementById('chatMessages');
  const chatInput = document.getElementById('chatInput');
  const chatSendBtn = document.getElementById('chatSendBtn');
  const chatBadge = document.getElementById('chatBadge');

  function updateClientUnread() {
    if (!chatBadge || !chatToggle) return;

    if (clientUnreadCount > 0) {
      chatBadge.textContent = clientUnreadCount > 99 ? '99+' : String(clientUnreadCount);
      chatBadge.classList.remove('hidden');
      chatToggle.classList.add('has-unread');
      if (!document.hidden) {
        document.title = `(${clientUnreadCount}) Новый ответ — Good Boost`;
      }
      return;
    }

    chatBadge.classList.add('hidden');
    chatToggle.classList.remove('has-unread');
    document.title = originalTitle;
  }

  function clearClientUnread() {
    clientUnreadCount = 0;
    updateClientUnread();
  }

  async function startChat() {
    const email = chatEmailInput?.value?.trim?.() || '';
    if (!email || !email.includes('@')) return;
    try { localStorage.setItem('chat_email', email); } catch (e) {}

    try {
      const data = await fetch('/api/chat/' + encodeURIComponent(email), { credentials: 'include' }).then(r => r.json());
      if (data?.chatId) {
        chatId = data.chatId;
        if (chatMessages && Array.isArray(data.messages)) {
          chatMessages.innerHTML = '';
          data.messages.forEach(m => chatMessages.appendChild(createMsgEl(m)));
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
      }
    } catch (e) {}

    try { socket.emit('chat:start', email); } catch (e) {}

    chatEmailForm?.classList.add('hidden');
    chatBody?.classList.remove('hidden');
    chatInput?.focus?.();
  }

  function sendUserMessage() {
    const text = chatInput?.value?.trim?.() || '';
    if (!text || !chatId) return;
    try { socket.emit('chat:send', { chatId, text }); } catch (e) {}
    if (chatInput) chatInput.value = '';
  }

  chatToggle?.addEventListener('click', () => {
    chatOpen = !chatOpen;
    chatWindow?.classList.toggle('hidden', !chatOpen);
    if (chatOpen) {
      clearClientUnread();
      if (window.currentUser && !chatId && chatEmailForm && !chatEmailForm.classList.contains('hidden') && chatEmailInput) {
        chatEmailInput.value = window.currentUser.email;
        startChat();
      }
      if (window.lucide) lucide.createIcons();
    }
  });

  chatClose?.addEventListener('click', () => {
    chatOpen = false;
    chatWindow?.classList.add('hidden');
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && chatOpen) {
      clearClientUnread();
    }
  });

  chatEmailBtn?.addEventListener('click', startChat);
  chatEmailInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startChat();
  });

  chatSendBtn?.addEventListener('click', sendUserMessage);
  chatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendUserMessage();
  });

  try {
    const savedEmail = localStorage.getItem('chat_email');
    if (savedEmail && chatEmailInput) {
      chatEmailInput.value = savedEmail;
      startChat();
    }
  } catch (e) {}

  socket.on('chat:started', (id) => {
    chatId = id;
  });

  let adminCurrentChatId = null;
  const adminUnreadByChat = new Map();
  const adminChatItems = document.getElementById('adminChatItems');
  const adminChatMessages = document.getElementById('adminChatMessages');
  const adminChatHeader = document.getElementById('adminChatHeader');
  const adminChatInput = document.getElementById('adminChatInput');
  const adminChatSend = document.getElementById('adminChatSend');
  const adminChatNavBadge = document.getElementById('adminChatNavBadge');

  function isAdminChatSectionActive() {
    return document.getElementById('admin-chat')?.classList.contains('active');
  }

  function getAdminUnreadTotal() {
    let total = 0;
    adminUnreadByChat.forEach((count) => { total += count; });
    return total;
  }

  function updateAdminUnreadUi() {
    const totalUnread = getAdminUnreadTotal();
    if (adminChatNavBadge) {
      if (totalUnread > 0) {
        adminChatNavBadge.textContent = totalUnread > 99 ? '99+' : String(totalUnread);
        adminChatNavBadge.classList.remove('hidden');
      } else {
        adminChatNavBadge.classList.add('hidden');
      }
    }
  }

  function markAdminChatRead(chatIdToReset) {
    if (!chatIdToReset) return;
    adminUnreadByChat.delete(Number(chatIdToReset));
    updateAdminUnreadUi();
  }

  async function loadAdminChats() {
    if (!adminChatItems) return;
    try {
      const chats = await fetch('/api/admin/chats', { credentials: 'include' }).then(r => r.json());
      if (!Array.isArray(chats) || chats.length === 0) {
        adminChatItems.innerHTML = '<p style="color:var(--gray);padding:16px;text-align:center;font-size:.9rem;">Нет активных чатов</p>';
        return;
      }

      adminChatItems.innerHTML = chats.map(c => {
        const title = c.user_email || c.email || `Чат #${c.id}`;
        const last = c.last_message ? escapeHtml(c.last_message) : '—';
        const unreadCount = adminUnreadByChat.get(Number(c.id)) || 0;
        const unreadBadge = unreadCount > 0
          ? `<span class="aci-unread">${unreadCount > 99 ? '99+' : unreadCount}</span>`
          : '';
        return `
          <div class="admin-chat-item ${unreadCount > 0 ? 'has-unread' : ''} ${Number(c.id) === Number(adminCurrentChatId) ? 'active' : ''}" data-chat-id="${c.id}">
            <div class="aci-top">
              <div class="aci-email">${escapeHtml(title)}</div>
              ${unreadBadge}
            </div>
            <div class="aci-last">${last}</div>
          </div>
        `;
      }).join('');

      adminChatItems.querySelectorAll('.admin-chat-item[data-chat-id]').forEach(el => {
        el.addEventListener('click', () => {
          const id = Number(el.getAttribute('data-chat-id'));
          openAdminChat(id);
        });
      });
      updateAdminUnreadUi();
    } catch (e) {
      adminChatItems.innerHTML = '<p style="color:var(--danger);padding:16px;text-align:center;font-size:.9rem;">Ошибка загрузки чатов</p>';
    }
  }

  async function openAdminChat(id) {
    if (!id) return;
    adminCurrentChatId = id;
    markAdminChatRead(id);
    try { socket.emit('admin:openChat', id); } catch (e) {}

    if (adminChatHeader) adminChatHeader.textContent = `Чат #${id}`;
    if (adminChatInput) adminChatInput.disabled = false;
    if (adminChatSend) adminChatSend.disabled = false;
    if (adminChatMessages) adminChatMessages.innerHTML = '';

    try {
      const msgs = await fetch('/api/admin/chats/' + id + '/messages', { credentials: 'include' }).then(r => r.json());
      if (adminChatMessages && Array.isArray(msgs)) {
        msgs.forEach(m => adminChatMessages.appendChild(createMsgEl(m)));
        adminChatMessages.scrollTop = adminChatMessages.scrollHeight;
      }
      loadAdminChats();
    } catch (e) {
      if (adminChatMessages) adminChatMessages.innerHTML = '<div style="color:var(--danger);padding:12px;">Ошибка загрузки сообщений</div>';
    }
  }

  function initAdminChat() {
    if (!adminChatItems) return;
    try { socket.emit('admin:join'); } catch (e) {}
    loadAdminChats();
  }

  function sendAdminMessage() {
    const text = adminChatInput?.value?.trim?.() || '';
    if (!text || !adminCurrentChatId) return;
    try { socket.emit('admin:send', { chatId: adminCurrentChatId, text }); } catch (e) {}
    if (adminChatInput) adminChatInput.value = '';
  }

  adminChatSend?.addEventListener('click', sendAdminMessage);
  adminChatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendAdminMessage();
  });

  window.openAdminChat = openAdminChat;

  if (adminChatItems) {
    setTimeout(initAdminChat, 250);
    document.querySelectorAll('.dash-nav a[data-section="admin-chat"]').forEach(link => {
      link.addEventListener('click', () => {
        setTimeout(() => {
          if (adminCurrentChatId) {
            markAdminChatRead(adminCurrentChatId);
          }
          initAdminChat();
          if (window.lucide) lucide.createIcons();
        }, 100);
      });
    });
  }

  socket.on('chat:message', (msg) => {
    if (chatMessages && msg?.chat_id === chatId) {
      chatMessages.appendChild(createMsgEl(msg));
      chatMessages.scrollTop = chatMessages.scrollHeight;
      if (!chatOpen && msg.sender === 'admin') {
        clientUnreadCount += 1;
        updateClientUnread();
      }
    }
    if (adminChatMessages && msg?.chat_id === adminCurrentChatId) {
      adminChatMessages.appendChild(createMsgEl(msg));
      adminChatMessages.scrollTop = adminChatMessages.scrollHeight;
    }

    if (adminChatItems && msg?.sender === 'user') {
      const sameActiveChat = Number(msg?.chat_id) === Number(adminCurrentChatId) && isAdminChatSectionActive();
      if (!sameActiveChat) {
        const nextCount = (adminUnreadByChat.get(Number(msg.chat_id)) || 0) + 1;
        adminUnreadByChat.set(Number(msg.chat_id), nextCount);
      } else {
        markAdminChatRead(msg.chat_id);
      }
      loadAdminChats();
    }
  });

  socket.on('chat:update', () => {
    if (adminChatItems) loadAdminChats();
  });

  socket.on('pricing:updated', () => {
    try { window.loadPricingAndApply?.(); } catch (e) {}
  });
})();
