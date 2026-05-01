async function loadDashboard() {
  if (!currentUser) { window.location.href = '/'; return; }

  document.getElementById('dashAvatar') && (document.getElementById('dashAvatar').textContent = (currentUser.name?.charAt(0) || 'U').toUpperCase());
  document.getElementById('dashUserName') && (document.getElementById('dashUserName').textContent = currentUser.name);
  document.getElementById('dashUserEmail') && (document.getElementById('dashUserEmail').textContent = currentUser.email);
  document.getElementById('profileName') && (document.getElementById('profileName').value = currentUser.name || '');

  try {
    const orders = await api('/api/orders');
    const tbody = document.getElementById('userOrdersBody');
    if (!tbody) return;
    if (orders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--gray);">Заказов пока нет</td></tr>';
    } else {
      tbody.innerHTML = orders.map(o => `
        <tr>
          <td>${o.id}</td>
          <td>${o.service}</td>
          <td>${o.details || '—'}</td>
          <td>${formatPrice(o.total)}</td>
          <td>${statusBadge(o.payment_status || (o.status === 'paid' ? 'paid' : 'unpaid'))}</td>
          <td>${statusBadge(o.status)}</td>
          <td>${formatDate(o.created)}</td>
        </tr>
      `).join('');
    }
  } catch {}
}

(document.querySelectorAll('.dash-nav a[data-section]') || []).forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const section = link.dataset.section;
    document.querySelectorAll('.dash-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.dash-nav a').forEach(a => a.classList.remove('active'));
    document.getElementById(section)?.classList.add('active');
    link.classList.add('active');
  });
});

document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/me', {
      method: 'PUT',
      body: JSON.stringify({ name: document.getElementById('profileName').value }),
    });
    currentUser.name = document.getElementById('profileName').value;
    document.getElementById('dashUserName') && (document.getElementById('dashUserName').textContent = currentUser.name);
    updateNavAuth();
    showAlert('profileSuccess', 'Профиль обновлён');
  } catch (err) { alert(err.message); }
});

document.getElementById('newOrderForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const service = document.getElementById('orderService').value;
  if (!service) return showAlert('newOrderError', 'Выберите услугу');
  try {
    let total = 0;
    const prefillEl = document.getElementById('prefillTotal');
    if (prefillEl) total = parseInt(prefillEl.value || '0') || 0;
    if (!total) total = servicePrices[service] || 0;
    await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify({ service, details: document.getElementById('orderDetails').value, total }),
    });
    showAlert('newOrderSuccess', 'Заказ оформлен!');
    document.getElementById('newOrderForm')?.reset();
    try { localStorage.removeItem('prefillOrder'); } catch(e) {}
    setTimeout(() => loadDashboard(), 1500);
  } catch (err) { showAlert('newOrderError', err.message); }
});

try {
  const raw = localStorage.getItem('prefillOrder');
  if (raw) {
    const p = JSON.parse(raw);
    if (p && document.getElementById('orderService')) {
      const sel = document.getElementById('orderService');
      if (![...sel.options].some(o => o.value === p.service)) {
        const opt = document.createElement('option'); opt.value = p.service; opt.textContent = p.service; sel.appendChild(opt);
      }
      sel.value = p.service;
      document.getElementById('orderDetails').value = p.details || '';
      let hidden = document.getElementById('prefillTotal');
      if (!hidden) {
        hidden = document.createElement('input');
        hidden.type = 'hidden'; hidden.id = 'prefillTotal'; hidden.name = 'prefillTotal';
        document.getElementById('newOrderForm')?.appendChild(hidden);
      }
      hidden.value = String(p.total || 0);
    }
  }
} catch(e) {}

if (location.hash && location.hash.includes('new-order')) {
  setTimeout(() => {
    document.querySelectorAll('.dash-nav a[data-section]').forEach(a => {
      a.classList.toggle('active', a.dataset.section === 'dash-new-order');
    });
    document.querySelectorAll('.dash-section').forEach(s => s.classList.toggle('active', s.id === 'dash-new-order'));
  }, 100);
}

window.loadDashboard = loadDashboard;

try {
  if (typeof io === 'function') {
    const orderSocket = io();
    orderSocket.on('order:updated', () => {
      try { loadDashboard(); } catch (e) {}
    });
    orderSocket.on('order:deleted', () => {
      try { loadDashboard(); } catch (e) {}
    });
    orderSocket.on('pricing:updated', () => {
      try { window.loadPricingAndApply?.(); } catch (e) {}
    });
  }
} catch (e) {}


let _clientPollTimer = null;
function startClientPolling() {
  if (_clientPollTimer) return;
  _clientPollTimer = setInterval(() => {
    try {
      if (currentUser) loadDashboard();
    } catch (e) {}
  }, 8000);
}
startClientPolling();
