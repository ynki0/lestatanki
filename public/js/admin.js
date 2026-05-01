async function refreshAdminStats() {
  try {
    const stats = await api('/api/admin/stats');
    const elUsers = document.getElementById('statUsers');
    const elOrders = document.getElementById('statOrders');
    const elPaid = document.getElementById('statPaid');
    if (elUsers) elUsers.textContent = stats.usersCount;
    if (elOrders) elOrders.textContent = stats.ordersCount;
    if (elPaid) elPaid.textContent = stats.paidOrdersCount ?? 0;
  } catch (e) {}
}

async function deleteOrder(id, btnEl) {
  if (!confirm('Удалить заказ из базы?')) return;
  try {
    if (btnEl) btnEl.disabled = true;
    await api('/api/admin/orders/' + id, { method: 'DELETE' });
    const tr = btnEl?.closest?.('tr');
    tr?.remove();
    await refreshAdminStats();
  } catch (err) {
    alert(err.message);
  } finally {
    if (btnEl) btnEl.disabled = false;
  }
}

async function loadAdmin() {
  if (!currentUser) { return; }
  if (currentUser.role !== 'admin') { window.location.href = '/'; return; }

  await refreshAdminStats();

  try {
    const orders = await api('/api/admin/orders');
    const tbody = document.getElementById('adminOrdersBody');
    if (!tbody) {
    } else {

    const escapeHtml = (v) => String(v ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');

    tbody.innerHTML = orders.length === 0
      ? '<tr><td colspan="9" class="table-cell-center text-gray">Нет заказов</td></tr>'
      : orders.map(o => `
        <tr>
          <td>${o.id}</td>
          <td>${escapeHtml(o.user_name)}<br><small class="text-gray">${escapeHtml(o.user_email)}</small></td>
          <td>${escapeHtml(o.service)}</td>
          <td class="details-cell">
            <small class="details-text">
              ${escapeHtml(o.details || '—').replaceAll('\n', '<br>')}
            </small>
          </td>
          <td>${formatPrice(o.total)}</td>
          <td>${statusBadge(o.payment_status || (o.status === 'paid' ? 'paid' : 'unpaid'))}</td>
          <td>${statusBadge(o.status)}</td>
          <td>${formatDate(o.created)}</td>
          <td>
            <div class="order-actions">
              <select class="form-control order-status-select" onchange="updateOrderStatus(${o.id}, this.value, this)">
              <option value="new" ${o.status === 'new' ? 'selected' : ''}>Новый</option>
              <option value="progress" ${o.status === 'progress' ? 'selected' : ''}>В работе</option>
              <option value="done" ${o.status === 'done' ? 'selected' : ''}>Готов</option>
              <option value="unpaid" ${o.status === 'unpaid' ? 'selected' : ''}>Не оплачен</option>
              <option value="paid" ${o.status === 'paid' ? 'selected' : ''}>Оплачен</option>
              <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>Отменен</option>
              </select>
              <button class="btn btn-danger btn-sm" onclick="deleteOrder(${o.id}, this)">Удалить</button>
            </div>
          </td>
        </tr>
      `).join('');
    }
  } catch (e) {
    const tbody = document.getElementById('adminOrdersBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="table-cell-center text-danger">Ошибка загрузки заказов: ${String(e?.message || e)}</td></tr>`;
  }

  try {
    const users = await api('/api/admin/users');
    const tbody = document.getElementById('adminUsersBody');
    if (!tbody) {
      return;
    }
    document.getElementById('adminUsersCount') && (document.getElementById('adminUsersCount').textContent = users.length);
    tbody.innerHTML = users.map(u => `
      <tr>
        <td>${u.id}</td>
        <td>${u.name}</td>
        <td>${u.email}</td>
        <td>${u.ordersCount ?? 0}</td>
        <td><span class="badge ${u.role === 'admin' ? 'badge-admin' : 'badge-user'}">${u.role}</span></td>
        <td>${formatDate(u.created)}</td>
        <td>${u.role !== 'admin' ? `<button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id})">Удалить</button>` : '—'}</td>
      </tr>
    `).join('');
    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="table-cell-center text-gray">Пользователей пока нет</td></tr>';
    }
  } catch (e) {
    const tbody = document.getElementById('adminUsersBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="table-cell-center text-danger">Ошибка загрузки пользователей: ${String(e?.message || e)}</td></tr>`;
  }
}

(document.querySelectorAll('#adminSidebar .dash-nav a[data-section]') || []).forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const section = link.dataset.section;
    document.querySelectorAll('.dash-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('#adminSidebar .dash-nav a').forEach(a => a.classList.remove('active'));
    document.getElementById(section)?.classList.add('active');
    link.classList.add('active');
    if (section === 'admin-pricing') {
      try { loadPricingForm(); } catch (e) {}
    }
  });
});

async function updateOrderStatus(id, status, selectEl) {
  try {
    if (selectEl) selectEl.disabled = true;
    await api('/api/admin/orders/' + id, { method: 'PUT', body: JSON.stringify({ status }) });

    const tr = selectEl?.closest?.('tr');
    const badgeTd = tr?.children?.[6];
    if (badgeTd) badgeTd.innerHTML = statusBadge(status);

    await refreshAdminStats();
  } catch (err) { alert(err.message); }
  finally {
    if (selectEl) selectEl.disabled = false;
  }
}

async function deleteUser(id) {
  if (!confirm('Удалить пользователя?')) return;
  try {
    await api('/api/admin/users/' + id, { method: 'DELETE' });
    loadAdmin();
  } catch (err) { alert(err.message); }
}

async function loadPricingForm() {
  const form = document.getElementById('pricingForm');
  if (!form) return;
  try {
    const cfg = await api('/api/admin/pricing');

    (cfg?.rig?.tiers || []).forEach((t, i) => {
      const priceEl = document.getElementById('rigPrice' + i);
      const minEl = document.getElementById('rigMin' + i);
      if (priceEl) priceEl.value = String(Number(t?.pricePerBattle ?? 0));
      if (minEl) minEl.value = String(Number(t?.minBattles ?? 1));
    });

    const segPP = cfg?.mark?.segmentPerPercent || {};
    const legacySeg = cfg?.mark?.segmentBase || {};
    const s1 = Number(segPP.s1 ?? (Number(legacySeg.s1) ? Number(legacySeg.s1) / 65 : 0));
    const s2 = Number(segPP.s2 ?? (Number(legacySeg.s2) ? Number(legacySeg.s2) / 20 : 0));
    const s3 = Number(segPP.s3 ?? (Number(legacySeg.s3) ? Number(legacySeg.s3) / 10 : 0));
    const fullBase = Number(cfg?.mark?.fullCycleBase ?? legacySeg.full ?? 0);
    document.getElementById('markS1') && (document.getElementById('markS1').value = String(Number.isFinite(s1) ? Math.round(s1) : 0));
    document.getElementById('markS2') && (document.getElementById('markS2').value = String(Number.isFinite(s2) ? Math.round(s2) : 0));
    document.getElementById('markS3') && (document.getElementById('markS3').value = String(Number.isFinite(s3) ? Math.round(s3) : 0));
    document.getElementById('markFull') && (document.getElementById('markFull').value = String(Number.isFinite(fullBase) ? Math.round(fullBase) : 0));
    const mods = cfg?.mark?.modifiers || {};
    document.getElementById('markModMedium') && (document.getElementById('markModMedium').value = String(Number(mods.medium ?? 0)));
    document.getElementById('markModHard') && (document.getElementById('markModHard').value = String(Number(mods.hard ?? 0)));

    const wn8 = cfg?.wn8?.tiers || {};
    document.getElementById('wn8Price5000') && (document.getElementById('wn8Price5000').value = String(Number(wn8['5000'] ?? 0)));
    document.getElementById('wn8Price7000') && (document.getElementById('wn8Price7000').value = String(Number(wn8['7000'] ?? 0)));
    document.getElementById('wn8Price8500') && (document.getElementById('wn8Price8500').value = String(Number(wn8['8500'] ?? 0)));
    document.getElementById('wn8Price10000') && (document.getElementById('wn8Price10000').value = String(Number(wn8['10000'] ?? 0)));
    document.getElementById('wn8Price12000') && (document.getElementById('wn8Price12000').value = String(Number(wn8['12000'] ?? 0)));

    const mult = cfg?.wn8?.multipliers || {};
    document.getElementById('wn8MultRush') && (document.getElementById('wn8MultRush').value = String(Number(mult.rush ?? 1.2)));
    document.getElementById('wn8MultSpecific') && (document.getElementById('wn8MultSpecific').value = String(Number(mult.specific ?? 1.15)));

    const lbz = cfg?.lbz?.basePrices || cfg?.obz?.basePrices || {};
    document.getElementById('lbzPrice1') && (document.getElementById('lbzPrice1').value = String(Number(lbz['1'] ?? 0)));
    document.getElementById('lbzPrice2') && (document.getElementById('lbzPrice2').value = String(Number(lbz['2'] ?? 0)));
    document.getElementById('lbzPrice3') && (document.getElementById('lbzPrice3').value = String(Number(lbz['3'] ?? 0)));
  } catch (e) {
    try { showAlert('pricingError', String(e?.message || e)); } catch (err) {}
  }
}

document.getElementById('pricingForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const tiers = Array.from({ length: 6 }).map((_, i) => {
      const price = Number(document.getElementById('rigPrice' + i)?.value || 0);
      const minBattles = Number(document.getElementById('rigMin' + i)?.value || 1);
      return { pricePerBattle: price, minBattles };
    });

    const payload = {
      rig: { tiers },
      mark: {
        segmentPerPercent: {
          s1: Number(document.getElementById('markS1')?.value || 0),
          s2: Number(document.getElementById('markS2')?.value || 0),
          s3: Number(document.getElementById('markS3')?.value || 0),
        },
        fullCycleBase: Number(document.getElementById('markFull')?.value || 0),
        modifiers: {
          medium: Number(document.getElementById('markModMedium')?.value || 0),
          hard: Number(document.getElementById('markModHard')?.value || 0),
        },
      },
      wn8: {
        tiers: {
          '5000': Number(document.getElementById('wn8Price5000')?.value || 0),
          '7000': Number(document.getElementById('wn8Price7000')?.value || 0),
          '8500': Number(document.getElementById('wn8Price8500')?.value || 0),
          '10000': Number(document.getElementById('wn8Price10000')?.value || 0),
          '12000': Number(document.getElementById('wn8Price12000')?.value || 0),
        },
        multipliers: {
          rush: Number(document.getElementById('wn8MultRush')?.value || 1.2),
          specific: Number(document.getElementById('wn8MultSpecific')?.value || 1.15),
        },
      },
      lbz: {
        basePrices: {
          '1': Number(document.getElementById('lbzPrice1')?.value || 0),
          '2': Number(document.getElementById('lbzPrice2')?.value || 0),
          '3': Number(document.getElementById('lbzPrice3')?.value || 0),
        },
      },
    };

    await api('/api/admin/pricing', { method: 'PUT', body: JSON.stringify(payload) });
    try { showAlert('pricingSuccess', 'Цены сохранены'); } catch (err) {}
  } catch (err) {
    try { showAlert('pricingError', String(err?.message || err)); } catch (e2) {}
  }
});

window.loadAdmin = loadAdmin;
window.deleteOrder = deleteOrder;
window.updateOrderStatus = updateOrderStatus;
window.deleteUser = deleteUser;

let _orderSocket = null;
try {
  if (typeof io === 'function') {
    _orderSocket = io();
    _orderSocket.on('order:updated', () => {
      try { loadAdmin(); } catch (e) {}
    });
    _orderSocket.on('order:deleted', () => {
      try { loadAdmin(); } catch (e) {}
    });
    _orderSocket.on('pricing:updated', () => {
      try { loadPricingForm(); } catch (e) {}
    });
  }
} catch (e) {}

let _adminPollTimer = null;
function startAdminPolling() {
  if (_adminPollTimer) return;
  _adminPollTimer = setInterval(() => {
    try {
      if (currentUser && currentUser.role === 'admin') loadAdmin();
    } catch (e) {}
  }, 8000);
}
startAdminPolling();

(async () => {
  try {
    if (!currentUser && typeof checkAuth === 'function') {
      await checkAuth();
    }
  } catch (e) {}
  try {
    await loadAdmin();
  } catch (e) {}
  try {
    await loadPricingForm();
  } catch (e) {}
})();
