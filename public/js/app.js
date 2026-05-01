let currentUser = null;

async function loadLayoutPartials() {
  const mounts = Array.from(document.querySelectorAll('[data-partial]'));
  if (mounts.length === 0) return;

  await Promise.all(mounts.map(async (mount) => {
    const partialUrl = mount.dataset.partial;
    if (!partialUrl) return;

    try {
      const res = await fetch(partialUrl, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`Failed to load partial: ${partialUrl}`);
      mount.outerHTML = await res.text();
    } catch (error) {
      console.error(error);
    }
  }));

  const navMode = document.body.dataset.navMode || 'full';
  if (navMode === 'logo-only') {
    document.querySelectorAll('[data-nav-role="full"]').forEach((element) => element.remove());
  }

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка сервера');
  return data;
}

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

const COOKIE_CONSENT_KEY = 'goodboost_cookie_consent_v1';

function hasCookieConsent() {
  try {
    return localStorage.getItem(COOKIE_CONSENT_KEY) === 'accepted';
  } catch (error) {
    return false;
  }
}

function setCookieConsentAccepted() {
  try {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
  } catch (error) {}
}

function setupCookieNotice() {
  if (hasCookieConsent() || document.querySelector('[data-cookie-notice]')) return;

  const notice = document.createElement('div');
  notice.className = 'cookie-notice';
  notice.setAttribute('data-cookie-notice', 'true');
  notice.setAttribute('role', 'dialog');
  notice.setAttribute('aria-live', 'polite');
  notice.setAttribute('aria-label', 'Уведомление об использовании cookie');
  notice.innerHTML = `
    <div class="cookie-notice__content">
      <p class="cookie-notice__text">Мы используем cookie, чтобы сайт работал корректно, запоминал ваши настройки и улучшал пользовательский опыт. Продолжая пользоваться сайтом, вы соглашаетесь с их использованием.</p>
      <div class="cookie-notice__actions">
        <a class="cookie-notice__link" href="/privacy">Подробнее</a>
        <button type="button" class="btn btn-gold btn-sm cookie-notice__button">Понятно</button>
      </div>
    </div>
  `;

  notice.querySelector('.cookie-notice__button')?.addEventListener('click', () => {
    setCookieConsentAccepted();
    notice.classList.add('is-hidden');
    window.setTimeout(() => notice.remove(), 260);
  });

  document.body.appendChild(notice);
  window.requestAnimationFrame(() => notice.classList.add('is-visible'));
}

function showAlert(id, msg, persistent = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  if (!persistent) setTimeout(() => (el.style.display = 'none'), 5000);
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatPrice(n) {
  return Number(n).toLocaleString('ru-RU') + ' ₽';
}

function statusBadge(status) {
  const map = {
    new: 'badge-new',
    progress: 'badge-progress',
    done: 'badge-done',
    paid: 'badge-done',
    unpaid: 'badge-unpaid',
    cancelled: 'badge-cancelled',
  };
  const labels = { new: 'Новый', progress: 'В работе', done: 'Готов', paid: 'Оплачен', unpaid: 'Не оплачен', cancelled: 'Отменен' };
  return `<span class="badge ${map[status] || 'badge-new'}">${labels[status] || status}</span>`;
}

let markSegmentPerPercent = { s1: 31, s2: 90, s3: 250 };
let markFullCycleBase = 4500;
let markModifiers = { medium: 700, hard: 1200 };
let lbzPrices = { '1': 1407, '2': 1800, '3': 2300 };
let wn8Multipliers = { rush: 1.2, specific: 1.15 };

async function loadPricingAndApply() {
  try {
    const cfg = await api('/api/pricing', { method: 'GET' });

    if (cfg?.mark?.segmentPerPercent) {
      markSegmentPerPercent = {
        s1: Number(cfg.mark.segmentPerPercent.s1 ?? markSegmentPerPercent.s1),
        s2: Number(cfg.mark.segmentPerPercent.s2 ?? markSegmentPerPercent.s2),
        s3: Number(cfg.mark.segmentPerPercent.s3 ?? markSegmentPerPercent.s3),
      };
    } else if (cfg?.mark?.segmentBase) {
      // Legacy fallback (segmentBase = full segment price)
      const seg = cfg.mark.segmentBase;
      markSegmentPerPercent = {
        s1: Number(seg.s1 ?? 0) / 65,
        s2: Number(seg.s2 ?? 0) / 20,
        s3: Number(seg.s3 ?? 0) / 10,
      };
    }

    if (cfg?.mark?.fullCycleBase !== undefined) {
      markFullCycleBase = Number(cfg.mark.fullCycleBase ?? markFullCycleBase);
    } else if (cfg?.mark?.segmentBase?.full !== undefined) {
      markFullCycleBase = Number(cfg.mark.segmentBase.full ?? markFullCycleBase);
    }

    if (cfg?.mark?.modifiers) {
      markModifiers = {
        medium: Number(cfg.mark.modifiers.medium ?? markModifiers.medium),
        hard: Number(cfg.mark.modifiers.hard ?? markModifiers.hard),
      };
    }
    const lbzBasePrices = cfg?.lbz?.basePrices || cfg?.obz?.basePrices;
    if (lbzBasePrices) {
      lbzPrices = {
        '1': Number(lbzBasePrices['1'] ?? lbzPrices['1']),
        '2': Number(lbzBasePrices['2'] ?? lbzPrices['2']),
        '3': Number(lbzBasePrices['3'] ?? lbzPrices['3']),
      };
    }
    if (cfg?.wn8?.multipliers) {
      wn8Multipliers = {
        rush: Number(cfg.wn8.multipliers.rush ?? wn8Multipliers.rush),
        specific: Number(cfg.wn8.multipliers.specific ?? wn8Multipliers.specific),
      };
    }

    // Apply to Rig select
    const rigSel = document.getElementById('calcRigTier');
    if (rigSel && Array.isArray(cfg?.rig?.tiers)) {
      cfg.rig.tiers.forEach((t, i) => {
        const opt = rigSel.options?.[i];
        if (!opt) return;
        if (t?.pricePerBattle !== undefined) opt.value = String(Number(t.pricePerBattle) || opt.value);
        if (t?.minBattles !== undefined) opt.dataset.min = String(Math.max(1, Number(t.minBattles) || 1));
      });
      try { syncRigMin(); } catch (e) {}
    }

    // Apply to WN8 select (option value = price per 10)
    const wn8Sel = document.getElementById('calcWn8Tier');
    if (wn8Sel && cfg?.wn8?.tiers) {
      const tiers = cfg.wn8.tiers;
      const order = ['5000', '7000', '8500', '10000', '12000'];
      order.forEach((key, idx) => {
        const opt = wn8Sel.options?.[idx];
        if (!opt) return;
        const price = Number(tiers[key]);
        if (Number.isFinite(price)) opt.value = String(price);
        opt.textContent = `WN8 ${key}+ — цена за 10 боёв ${Number.isFinite(price) ? price : opt.value} ₽`;
      });
    }

    // Recalculate totals (safe on all pages)
    try { updateRigCalc(); } catch (e) {}
    try { updateMarkCalc(); } catch (e) {}
    try { updateLbzTankOptions(); } catch (e) {}
    try { updateLbzCalc(); } catch (e) {}
    try { updateWn8Calc(); } catch (e) {}
  } catch (e) {
  }
}

try { window.loadPricingAndApply = loadPricingAndApply; } catch (e) {}

let _pricingPollTimer = null;
function startPricingPolling() {
  if (_pricingPollTimer) return;
  _pricingPollTimer = setInterval(() => {
    try { loadPricingAndApply(); } catch (e) {}
  }, 10000);
}

const servicePrices = {
  'Прокачка WN8': 500,
  'Прокачка % побед': 1500,
  'Фарм серебра': 3000,
  'Выполнение ЛБЗ': 5000,
  'Прокачка ветки': 15000,
  'Наградной танк': 25000,
};

function updateNavAuth() {
  const nav = $('#navAuth');
  if (!nav) return;

  if (currentUser) {
    const isAdmin = currentUser.role === 'admin';
    nav.innerHTML = `
      <a class="btn btn-outline btn-sm" href="${isAdmin ? '/admin' : '/client'}">
        <i data-lucide="${isAdmin ? 'settings' : 'user'}" style="width:16px;height:16px;"></i> <span>${currentUser.name}</span>
      </a>
      <a class="btn btn-sm" style="color:var(--gray)" href="#" onclick="(async()=>{await api('/api/logout',{method:'POST'});try{localStorage.removeItem('chat_email');}catch(e){};currentUser=null;updateNavAuth();window.location.href='/';})()">Выйти</a>
    `;
  } else {
    nav.innerHTML = `
      <a class="btn btn-outline btn-sm" href="/login">Вход</a>
      <a class="btn btn-gold btn-sm" href="/register">Регистрация</a>
    `;
  }
  if (window.lucide) lucide.createIcons();
}

function setNavReady() {
  document.body.classList.add('nav-ready');
}

function maybeOpenShopSection() {
  if (window.location.pathname !== '/shop') return;

  const shopSection = document.getElementById('shop');
  if (!shopSection) return;

  window.requestAnimationFrame(() => {
    shopSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function setupLayoutBindings() {
  window.addEventListener('scroll', () => {
    $('#navbar')?.classList.toggle('scrolled', window.scrollY > 50);
  });

  $('#burger')?.addEventListener('click', () => {
    $('#burger').classList.toggle('active');
    $('#navLinks').classList.toggle('open');
  });

  $$('[data-animate]').forEach(el => observer.observe(el));
  $$('[data-count-to]').forEach(el => observer.observe(el));

  $$('.nav-links a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const target = link.getAttribute('href');
      if (target.startsWith('#') && document.getElementById(target.substring(1))) {
        e.preventDefault();
        document.querySelector(target)?.scrollIntoView({ behavior: 'smooth' });
        $('#navLinks')?.classList.remove('open');
        $('#burger')?.classList.remove('active');
      }
    });
  });

  $$('a[href="/shop"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (window.location.pathname !== '/') return;
      const shopSection = document.getElementById('shop');
      if (!shopSection) return;

      event.preventDefault();
      window.history.pushState({}, '', '/shop');
      shopSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('#navLinks')?.classList.remove('open');
      $('#burger')?.classList.remove('active');
    });
  });
}

async function checkAuth() {
  try {
    currentUser = await api('/api/me');
    updateNavAuth();
  } catch {
    currentUser = null;
    updateNavAuth();
  }
  try { document.dispatchEvent(new CustomEvent('auth:checked')); } catch (e) {}
}

function animateCountUp(element) {
  if (!element || element.dataset.countAnimated === 'true') return;

  const target = Number(element.dataset.countTo || 0);
  if (!Number.isFinite(target) || target <= 0) return;

  const suffix = element.dataset.countSuffix || '';
  const duration = 1200;
  const startTime = performance.now();

  element.dataset.countAnimated = 'true';

  const render = (value) => {
    element.textContent = `${Math.round(value).toLocaleString('ru-RU')}${suffix}`;
  };

  const frame = (currentTime) => {
    const progress = Math.min((currentTime - startTime) / duration, 1);
    const easedProgress = 1 - Math.pow(1 - progress, 3);
    render(target * easedProgress);

    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      render(target);
    }
  };

  render(0);
  requestAnimationFrame(frame);
}



const lightTanks = [
  'Astron-FL','FV4005','Об. 268/5','FV215b 183','Foch B','113 BO','Об. 268','Об. 268/4','T-54D','СУ-122В','Badger','Strv 103B','Foch 155','Grille 15','Progetto 65','Sturmtiger','Ho-Ri 3','Т-22 ср.','Maus','ИС-4','Jg.Pz. E 100','Об. 430У','Об. 705А','Оруженосец','E 100','121','T110E4','121B','Minotauro','GPT-75','Об. 277','XM57','Pz.Kpfw. VII','Condor','M-V-Y','TVP T 50/51','B-C 25 t','T110E3','E 50 M','Type 71','S. Conqueror','UDES 15/16','Об. 140','Т-62А','STB-1','WT E 100','Царь','К-91'
];

const mediumTanks = [
  'BZ-75','СТ-II','Kranvagn','M60','Centurion AX','Rinoceronte','Merkava LP','StuG Maus','Vz. 55','Żubr','AMX 30 B','WZ-113G FT','60TP','T110E5','ИС-7','Об. 780','Kpz. 07 P(E)','Gendarme','Таран','Nemesis','Leopard 1','Erich Kn. I','AMX M4 54','M48 Patton','Lion','CS-63','Морион','114 SP2','FV215b','T57 Heavy','113','Roland'
];

const hardTanks = [
  'Sheridan','AMX 13 105','Т-100 ЛТ','EBR 105','WZ-132-1','Rhm. Pzw.','Concept 5','Vulcan','ТЭТ-100','Об. 718Б','WZ-111 5A','Firebird','AMX 50 B','Квант','BZ-74-1','WZ-111 QL','Grayhound','MT-58','Об. 260','Projet 57','Type 5 H','Manticore','H-3','Orso','Ampere','Об. 907','Czołg (P)','Wiedźmak','Об. 278','Feuerbär','Об. 279 (р)','Драгун','DZT-159','Warrior','Wilk','Carro 45 t','T95E6','VK 72.01 K','Projet Murat','116-F3','T95/FV4201'
];

const companyTanks = {
  '1': ['Stug IV','T28 HTC','T 55A','Об. 260'],
  '2': ['Excalibur','Chimera','Об. 279 (Р)'],
  '3': ['ARMT','TF-2 Clark','Projet Murat']
};

const wn8Prices = {
  '5000': 2000,
  '7000': 2500,
  '8500': 3000,
  '10000': 4000,
  '12000': 5000,
};

let lastCalcMarkTotal = 0;

function getAllMarkTankEntries() {
  return [
    ...lightTanks.map(name => ({ category: 'light', name })),
    ...mediumTanks.map(name => ({ category: 'medium', name })),
    ...hardTanks.map(name => ({ category: 'hard', name })),
  ];
}

function setMarkCategory(category) {
  const categoryEl = $('#calcMarkCategory');
  if (!categoryEl) return;
  if (categoryEl.value !== category) categoryEl.value = category;
}

function syncMarkCategoryFromSelectedTank() {
  const selectedValue = $('#calcMarkTank')?.value || '';
  if (!selectedValue.includes('|')) return;
  const [category, tankName] = selectedValue.split('|');
  if (!category || !tankName) return;
  setMarkCategory(category);
  const filterEl = $('#calcMarkFilter');
  if (filterEl) filterEl.value = tankName;
}

function updateMarkTankOptions() {
  const sel = $('#calcMarkTank');
  if (!sel) return;
  const category = $('#calcMarkCategory')?.value || 'light';
  const query = ($('#calcMarkFilter')?.value || '').trim().toLowerCase();
  const allEntries = getAllMarkTankEntries();

  let list = [];
  if (query) {
    list = allEntries
      .filter(item => item.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  } else if (category === 'light') {
    list = lightTanks.map(name => ({ category: 'light', name }));
  } else if (category === 'medium') {
    list = mediumTanks.map(name => ({ category: 'medium', name }));
  } else if (category === 'hard') {
    list = hardTanks.map(name => ({ category: 'hard', name }));
  }

  const previousValue = sel.value;
  sel.innerHTML = '';

  if (list.length === 0) {
    sel.innerHTML = '<option value="" disabled selected>Танк не найден</option>';
    return;
  }

  list.forEach(item => {
    sel.innerHTML += `<option value="${item.category}|${item.name}">${item.name}</option>`;
  });

  const hasPrevious = Array.from(sel.options).some(opt => opt.value === previousValue);
  if (hasPrevious) {
    sel.value = previousValue;
  } else if (sel.options.length > 0) {
    sel.selectedIndex = 0;
  }

  const selectedValue = sel.value || '';
  if (selectedValue.includes('|')) {
    const [selectedCategory] = selectedValue.split('|');
    if (selectedCategory) setMarkCategory(selectedCategory);
  }
}

function handleMarkFilterInput() {
  updateMarkTankOptions();
  const sel = $('#calcMarkTank');
  const selectedValue = sel?.value || '';
  if (selectedValue.includes('|')) {
    const [selectedCategory] = selectedValue.split('|');
    if (selectedCategory) setMarkCategory(selectedCategory);
  }
  updateMarkCalc();
}

function handleMarkTankSelect() {
  syncMarkCategoryFromSelectedTank();
  if ($('#calcMarkFilter')) {
    const selectedText = $('#calcMarkTank')?.selectedOptions?.[0]?.textContent || '';
    if (selectedText) $('#calcMarkFilter').value = selectedText;
  }
  updateMarkCalc();
}

function updateRigCalc() {
  const priceEl = $('#calcRigPrice');
  if (!priceEl) return;
  const sel = $('#calcRigTier')?.selectedOptions?.[0];
  const price = sel ? parseInt(sel.value || 0) : 0;
  const min = sel ? parseInt(sel.dataset.min || 1) : 1;
  const qtyInput = $('#calcRigQty');
  const qtyRaw = qtyInput ? parseInt(String(qtyInput.value || '0'), 10) : 0;
  let qty = Number.isFinite(qtyRaw) ? qtyRaw : 0;
  if (qtyInput && Number.isFinite(qtyRaw) && qtyRaw > 100) {
    qty = 100;
    qtyInput.value = '100';
  }
  const total = price * Math.max(0, qty);
  priceEl.textContent = formatPrice(total);
  const noteEl = $('#calcRigNote');
  if (noteEl) {
    if (qty > 0 && qty < min) noteEl.textContent = `Минимум для оформления: ${min} боёв`;
    else noteEl.textContent = '';
  }
}

function syncRigMin() {
  const sel = $('#calcRigTier')?.selectedOptions?.[0];
  const min = sel ? parseInt(sel.dataset.min || 1) : 1;
  const qtyInput = $('#calcRigQty');
  if (!qtyInput) return;
  qtyInput.min = '1';
  qtyInput.dataset.minOrder = String(min);
}

function normalizeMarkPercentInput(inputEl) {
  if (!inputEl) return null;
  const raw = String(inputEl.value ?? '').trim();
  if (raw === '') return null;

  const parsed = Math.round(Number(raw));
  if (!Number.isFinite(parsed)) {
    inputEl.value = '';
    return null;
  }

  const normalized = Math.max(0, Math.min(95, parsed));
  if (String(normalized) !== raw) {
    inputEl.value = String(normalized);
  }

  return normalized;
}

function updateMarkCalc() {
  const priceEl = $('#calcMarkPrice');
  if (!priceEl) return;
  const selVal = ($('#calcMarkTank')?.value) || '';
  let category = 'normal', tankName = '';
  if (selVal && selVal !== 'normal') {
    const parts = selVal.split('|');
    if (parts.length === 2) { category = parts[0]; tankName = parts[1]; }
  }
  const modifierPerSegment = category === 'medium'
    ? (markModifiers.medium || 0)
    : (category === 'hard' ? (markModifiers.hard || 0) : 0);

  const noteEl = $('#calcMarkNote');
  const clampPct = (v) => {
    const n = Math.round(Number(v || 0));
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(95, n));
  };

  const desiredRaw = $('#calcMarkPercent')?.value;
  const currentRaw = $('#calcMarkCurrentPercent')?.value;
  normalizeMarkPercentInput($('#calcMarkPercent'));
  normalizeMarkPercentInput($('#calcMarkCurrentPercent'));
  const desiredPct = clampPct(desiredRaw);
  const currentPct = clampPct(currentRaw);

  let total = 0;
  let note = '';

  if (!desiredRaw || desiredPct <= 0) {
    total = 0;
    note = '';
  } else if (desiredPct < currentPct) {
    total = 0;
    note = 'Цель меньше текущего процента — стоимость 0 ₽.';
  } else {
    const start = currentPct;
    const end = desiredPct;

    const segs = [
      { from: 0, to: 65, pp: Number(markSegmentPerPercent.s1 || 0) },
      { from: 65, to: 85, pp: Number(markSegmentPerPercent.s2 || 0) },
      { from: 85, to: 95, pp: Number(markSegmentPerPercent.s3 || 0) },
    ];

    const overlapLen = (a, b, segFrom, segTo) => Math.max(0, Math.min(b, segTo) - Math.max(a, segFrom));

    let base = 0;
    let segmentsTraversed = 0;
    segs.forEach(s => {
      const len = overlapLen(start, end, s.from, s.to);
      if (len > 0) {
        segmentsTraversed += 1;
        base += len * (Number.isFinite(s.pp) ? s.pp : 0);
      }
    });

    const addon = segmentsTraversed * modifierPerSegment;
    total = base + addon;

    // Optional override for full cycle 0->95 when admin configured it.
    if (start === 0 && end === 95 && Number(markFullCycleBase || 0) > 0) {
      total = Number(markFullCycleBase || 0) + (3 * modifierPerSegment);
    }

    const delta = Math.max(0, end - start);
    note = delta > 0
      ? `К оплате: +${delta}% (с ${start}% до ${end}%).`
      : 'Нечего докачивать — стоимость 0 ₽.';
  }

  lastCalcMarkTotal = Math.round(total);
  priceEl.textContent = lastCalcMarkTotal ? formatPrice(lastCalcMarkTotal) : '0 ₽';
  if (noteEl) noteEl.textContent = note;
}

function updateWn8Calc() {
  const priceEl = $('#calcWn8Price');
  if (!priceEl) return;
  const sel = $('#calcWn8Tier');
  if (!sel) return;
  const pricePer10 = parseInt(sel.value || '0');
  const qtyInput = $('#calcWn8Qty');
  const qtyRaw = parseInt(String(qtyInput?.value || ''), 10);
  if (qtyInput && Number.isFinite(qtyRaw) && qtyRaw > 100) qtyInput.value = '100';
  const qty = Math.max(1, Math.min(100, parseInt(String(qtyInput?.value || '1'), 10) || 1));
  let total = pricePer10 * qty;
  if ($('#wn8Rush')?.checked) total = Math.round(total * (wn8Multipliers.rush || 1));
  if ($('#wn8Specific')?.checked) total = Math.round(total * (wn8Multipliers.specific || 1));
  priceEl.textContent = total ? formatPrice(total) : '0 ₽';
}

function updateLbzCalc() {
  const priceEl = $('#calcLbzPrice');
  if (!priceEl) return;
  const block = $('#calcLbzBlock')?.value || '1';
  const qtyInput = $('#calcLbzQty');
  const qtyRaw = parseInt(String(qtyInput?.value || ''), 10);
  if (qtyInput && Number.isFinite(qtyRaw) && qtyRaw > 100) qtyInput.value = '100';
  const qty = Math.max(1, Math.min(100, parseInt(String(qtyInput?.value || '1'), 10) || 1));
  const basePrice = lbzPrices[block] || 1407;
  let base = basePrice;
  const tankChecks = Array.from(document.querySelectorAll('.lbz-tank-checkbox:checked'));
  if (tankChecks.length > 0) {
    base = tankChecks.reduce((s, el) => s + Number(el.dataset.price || 0), 0);
  }
  const mods = Array.from(document.querySelectorAll('.lbz-mod-checkbox:checked'));
  const percentSum = mods.reduce((s, el) => s + Number(el.dataset.percent || 0), 0);
  const total = Math.round(base * (1 + percentSum / 100) * qty);
  priceEl.textContent = formatPrice(total);
}

function updateLbzTankOptions() {
  const sel = $('#calcLbzTank');
  const block = $('#calcLbzBlock')?.value || '1';
  if (!sel) return;
  sel.innerHTML = '';
  const list = companyTanks[block] || [];
  if (list.length === 0) {
    sel.innerHTML = '<option value="" disabled selected>Нет списка танков</option>';
    return;
  }
  list.forEach(t => sel.innerHTML += `<option value="${t}">${t}</option>`);
}

$('#calcRigTier')?.addEventListener('change', () => { syncRigMin(); updateRigCalc(); });
$('#calcRigQty')?.addEventListener('input', () => { updateRigCalc(); });
$('#calcMarkCategory')?.addEventListener('change', () => {
  const filterEl = $('#calcMarkFilter');
  if (filterEl && filterEl.value.trim()) filterEl.value = '';
  updateMarkTankOptions();
  updateMarkCalc();
});
$('#calcMarkTank')?.addEventListener('change', handleMarkTankSelect);
$('#calcMarkPercent')?.addEventListener('input', () => {
  normalizeMarkPercentInput($('#calcMarkPercent'));
  updateMarkCalc();
});
$('#calcMarkCurrentPercent')?.addEventListener('input', () => {
  normalizeMarkPercentInput($('#calcMarkCurrentPercent'));
  updateMarkCalc();
});
$('#calcMarkFilter')?.addEventListener('input', handleMarkFilterInput);

$('#calcWn8Tier')?.addEventListener('change', updateWn8Calc);
$('#calcWn8Qty')?.addEventListener('input', updateWn8Calc);
$('#wn8Rush')?.addEventListener('change', updateWn8Calc);
$('#wn8Specific')?.addEventListener('change', updateWn8Calc);
$('#calcLbzBlock')?.addEventListener('change', () => { updateLbzTankOptions(); updateLbzCalc(); });
$('#calcLbzTank')?.addEventListener('change', updateLbzCalc);
$('#calcLbzQty')?.addEventListener('input', updateLbzCalc);
Array.from(document.querySelectorAll('.lbz-mod-checkbox')).forEach(ch => ch.addEventListener('change', updateLbzCalc));

updateMarkTankOptions();
updateRigCalc();
updateMarkCalc();
updateLbzTankOptions();
updateLbzCalc();
updateWn8Calc();

const orderModal = {
  overlay: document.getElementById('orderModalOverlay'),
  closeBtn: document.getElementById('orderModalClose'),
  cancelBtn: document.getElementById('orderModalCancel'),
  confirmBtn: document.getElementById('orderModalConfirm'),
  serviceEl: document.getElementById('orderModalService'),
  totalEl: document.getElementById('orderModalTotal'),
  commentEl: document.getElementById('orderModalComment'),
  errorEl: document.getElementById('orderModalError'),
};

const paymentSuccessModal = {
  overlay: document.getElementById('paymentSuccessModalOverlay'),
  closeBtn: document.getElementById('paymentSuccessModalClose'),
  okBtn: document.getElementById('paymentSuccessModalOk'),
};

let pendingPrefill = null;
let lastFocusedElBeforeModal = null;

function setOrderModalError(msg) {
  if (!orderModal.errorEl) return;
  orderModal.errorEl.textContent = msg || '';
  orderModal.errorEl.classList.toggle('hidden', !msg);
}

function openOrderModal(prefill) {
  if (!orderModal.overlay) return false;
  pendingPrefill = prefill;
  lastFocusedElBeforeModal = document.activeElement;
  setOrderModalError('');
  if (orderModal.serviceEl) orderModal.serviceEl.textContent = prefill?.service || '—';
  if (orderModal.totalEl) orderModal.totalEl.textContent = formatPrice(prefill?.total || 0);
  if (orderModal.commentEl) {
    orderModal.commentEl.value = '';
    setTimeout(() => orderModal.commentEl?.focus(), 0);
  }
  orderModal.overlay.classList.remove('hidden');
  orderModal.overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  return true;
}

function closeOrderModal() {
  if (!orderModal.overlay) return;
  pendingPrefill = null;
  setOrderModalError('');
  orderModal.overlay.classList.add('hidden');
  orderModal.overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  try { lastFocusedElBeforeModal?.focus?.(); } catch (e) {}
}

function openPaymentSuccessModal() {
  if (!paymentSuccessModal.overlay) return;
  lastFocusedElBeforeModal = document.activeElement;
  paymentSuccessModal.overlay.classList.remove('hidden');
  paymentSuccessModal.overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closePaymentSuccessModal() {
  if (!paymentSuccessModal.overlay) return;
  paymentSuccessModal.overlay.classList.add('hidden');
  paymentSuccessModal.overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  try { lastFocusedElBeforeModal?.focus?.(); } catch (e) {}
}

function clearPaymentReturnParams() {
  const params = new URLSearchParams(window.location.search);
  params.delete('payment');
  params.delete('orderId');
  const nextQuery = params.toString();
  const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash || ''}`;
  try {
    window.history.replaceState({}, document.title, nextUrl);
  } catch (e) {}
}

async function waitForOrderPayment(orderId, attempts = 8, delayMs = 2000) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await api(`/api/orders/${orderId}/payment-status?refresh=1`, { method: 'GET' });
      if (result?.paymentStatus === 'paid' || result?.status === 'paid') {
        return true;
      }
    } catch (e) {}

    if (attempt < attempts - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return false;
}

async function maybeHandlePaymentReturn() {
  if (!paymentSuccessModal.overlay) return;
  const params = new URLSearchParams(window.location.search);
  const payment = params.get('payment');
  const orderId = Number(params.get('orderId') || 0);

  if (payment === 'success') {
    openPaymentSuccessModal();
    clearPaymentReturnParams();
    return;
  }

  if (!orderId || !currentUser) return;

  const paid = await waitForOrderPayment(orderId);
  if (paid) {
    openPaymentSuccessModal();
  }

  clearPaymentReturnParams();
}

function markRangeFromPercent(pct) {
  if (!pct || pct <= 0) return '';
  if (pct === 95) return '0%–95% (полный цикл)';
  if (pct <= 65) return '0%–65%';
  if (pct <= 85) return '65%–85%';
  if (pct <= 95) return '85%–95%';
  return '';
}

function markCategoryLabel(key) {
  const map = { light: 'Лёгкие', medium: 'Средние', hard: 'Сложные' };
  return map[key] || key || '';
}

if (orderModal.overlay) {
  orderModal.closeBtn?.addEventListener('click', closeOrderModal);
  orderModal.cancelBtn?.addEventListener('click', closeOrderModal);

  orderModal.overlay.addEventListener('click', (e) => {
    if (e.target === orderModal.overlay) closeOrderModal();
  });

  document.addEventListener('keydown', (e) => {
    if (orderModal.overlay.classList.contains('hidden')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeOrderModal();
    }
  });

  orderModal.confirmBtn?.addEventListener('click', async () => {
    if (!pendingPrefill) return;
    if (!currentUser) { window.location.href = '/register'; return; }

    const comment = (orderModal.commentEl?.value || '').trim();
    if (!comment) {
      setOrderModalError('Пожалуйста, заполните комментарий (данные аккаунта/задания/техника/пожелания).');
      orderModal.commentEl?.focus();
      return;
    }

    const total = Number(pendingPrefill.total || 0);
    if (!total) {
      setOrderModalError('Сумма заказа равна 0 ₽. Проверьте выбранные параметры в калькуляторе.');
      return;
    }

    const prefill = { ...pendingPrefill };
    prefill.details = [prefill.details, `Комментарий: ${comment}`].filter(Boolean).join('\n');

    const btn = orderModal.confirmBtn;
    const prevText = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Отправка...'; }
    setOrderModalError('');
    try {
      const created = await api('/api/orders', {
        method: 'POST',
        body: JSON.stringify({ service: prefill.service, details: prefill.details, total: prefill.total }),
      });
      const orderId = created?.id;
      if (!orderId) throw new Error('Не удалось создать заказ');

      const pay = await api(`/api/orders/${orderId}/pay`, { method: 'POST' });
      if (!pay?.url) throw new Error('Не удалось получить ссылку на оплату');

      closeOrderModal();
      window.location.href = pay.url;
    } catch (e) {
      setOrderModalError(String(e?.message || e));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = prevText || 'Продолжить'; }
    }
  });
}

if (paymentSuccessModal.overlay) {
  paymentSuccessModal.closeBtn?.addEventListener('click', closePaymentSuccessModal);
  paymentSuccessModal.okBtn?.addEventListener('click', closePaymentSuccessModal);

  paymentSuccessModal.overlay.addEventListener('click', (e) => {
    if (e.target === paymentSuccessModal.overlay) closePaymentSuccessModal();
  });

  document.addEventListener('keydown', (e) => {
    if (paymentSuccessModal.overlay.classList.contains('hidden')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closePaymentSuccessModal();
    }
  });
}

$$('.calc-order-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!currentUser) { window.location.href = '/register'; return; }
    const calc = btn.dataset.calc;
    const prefill = { service: '', details: '', total: 0 };
    if (calc === 'mark') {
      const clampPct = (v) => {
        const n = Math.round(Number(v || 0));
        if (!Number.isFinite(n)) return 0;
        return Math.max(0, Math.min(95, n));
      };
      const desiredEl = $('#calcMarkPercent');
      const currentEl = $('#calcMarkCurrentPercent');
      normalizeMarkPercentInput(desiredEl);
      normalizeMarkPercentInput(currentEl);
      const category = $('#calcMarkCategory')?.value || '';
      const selVal = ($('#calcMarkTank')?.value) || '';
      let tankName = selVal && selVal.includes('|') ? selVal.split('|')[1] : (selVal || 'Не указан');
      const desiredRaw = desiredEl?.value;
      const currentRaw = currentEl?.value;
      const pct = clampPct(desiredRaw);
      const currentPct = clampPct(currentRaw);
      if (!desiredRaw || pct <= 0) {
        alert('Введите желаемый процент (1–95).');
        return;
      }
      if (pct < currentPct) {
        alert('Желаемый процент не может быть меньше текущего.');
        return;
      }
      const delta = Math.max(0, pct - currentPct);
      const rangeText = markRangeFromPercent(pct);
      prefill.service = 'Отметки на танке';
      const catLabel = markCategoryLabel(category);
      prefill.details = [
        `Танк: ${tankName}`,
        (currentRaw !== undefined && currentRaw !== '' && currentPct >= 0) ? `Текущий: ${currentPct}%` : '',
        pct ? `Цель: ${pct}%` : '',
        delta ? `Нужно поднять: +${delta}%` : '',
        rangeText ? `Диапазон: ${rangeText}` : '',
        catLabel ? `Категория: ${catLabel}` : '',
      ].filter(Boolean).join('\n');
      prefill.total = lastCalcMarkTotal || 0;
      if (!prefill.total) {
        alert('Сумма равна 0 ₽. Проверьте введённые проценты.');
        return;
      }
    } else if (calc === 'rig') {
      prefill.service = 'Подставные бои';
      const tierText = $('#calcRigTier')?.selectedOptions?.[0]?.textContent || '';
      const sel = $('#calcRigTier')?.selectedOptions?.[0];
      const min = sel ? parseInt(sel.dataset.min || '1', 10) : 1;
      const qtyRaw = parseInt(String($('#calcRigQty')?.value || '0'), 10);
      const qty = Number.isFinite(qtyRaw) ? qtyRaw : 0;
      if (qty > 100) {
        alert('Максимум для оформления: 100 боёв.');
        return;
      }
      if (qty < min) {
        alert(`Минимум для оформления: ${min} боёв.`);
        return;
      }
      prefill.details = [
        tierText ? `Уровень: ${tierText}` : '',
        `Количество боёв: ${qty}`,
      ].filter(Boolean).join('\n');
      prefill.total = parseInt(($('#calcRigPrice')?.textContent || '0').replace(/[^0-9]/g, '')) || 0;
    } else if (calc === 'lbz') {
      prefill.service = 'ЛБЗ (личные боевые задачи)';
      const blockText = $('#calcLbzBlock')?.selectedOptions?.[0]?.textContent || ($('#calcLbzBlock')?.value || '');
      const tankText = $('#calcLbzTank')?.selectedOptions?.[0]?.textContent || ($('#calcLbzTank')?.value || '');
      const qtyRaw = parseInt(String($('#calcLbzQty')?.value || '1'), 10);
      const qty = Math.max(1, Number.isFinite(qtyRaw) ? qtyRaw : 1);
      if (qty > 100) { alert('Максимум: 100 задач.'); return; }
      const mods = Array.from(document.querySelectorAll('.lbz-mod-checkbox:checked')).map(c => c.closest('label')?.textContent.trim()).filter(Boolean);
      const tankChecks = Array.from(document.querySelectorAll('.lbz-tank-checkbox:checked')).map(c => c.closest('label')?.querySelector('span')?.textContent || '').filter(Boolean);
      const extras = [].concat(tankChecks, mods).filter(Boolean);
      prefill.details = [
        blockText ? `Компания: ${blockText}` : '',
        tankText ? `Танк: ${tankText}` : '',
        `Количество задач: ${qty}`,
        extras.length ? `Опции: ${extras.join(', ')}` : '',
      ].filter(Boolean).join('\n');
      prefill.total = parseInt(($('#calcLbzPrice')?.textContent || '0').replace(/[^0-9]/g, '')) || 0;
    
    } else if (calc === 'wn8') {
        prefill.service = 'Буст WN8';
        const tierText = $('#calcWn8Tier')?.selectedOptions?.[0]?.textContent || '';
        const qtyRaw = parseInt(String($('#calcWn8Qty')?.value || '1'), 10);
        const qty = Math.max(1, Number.isFinite(qtyRaw) ? qtyRaw : 1);
        if (qty > 100) { alert('Максимум: 100 наборов.'); return; }
        const rush = $('#wn8Rush')?.checked ? ' + без очереди' : '';
        const specific = $('#wn8Specific')?.checked ? ' + конкретный танк' : '';
        prefill.details = [
          tierText ? `Цель: ${tierText}` : '',
          `Количество наборов: ${qty}×10 боёв`,
          rush ? 'Опция: без очереди (+20%)' : '',
          specific ? 'Опция: конкретный танк (+15%)' : '',
        ].filter(Boolean).join('\n');
        prefill.total = parseInt(($('#calcWn8Price')?.textContent || '0').replace(/[^0-9]/g, '')) || 0;
    }

    const opened = openOrderModal(prefill);
    if (!opened) {
      (async () => {
        try {
          await api('/api/orders', { method: 'POST', body: JSON.stringify(prefill) });
          window.location.href = '/client';
        } catch (e) {
          alert(String(e?.message || e));
        }
      })();
    }
  });
});

function toggleSidebar(sidebarId) {
  const sidebar = document.getElementById(sidebarId);
  const overlayId = sidebarId === 'dashSidebar' ? 'dashOverlay' : 'adminOverlay';
  const overlay = document.getElementById(overlayId);
  if (!sidebar) return;
  sidebar.classList.toggle('open');
  overlay?.classList.toggle('hidden');
}

document.addEventListener('click', (e) => {
  const link = e.target.closest('.dash-nav a[data-section]');
  if (!link) return;
  const sidebar = link.closest('.dash-sidebar');
  if (sidebar && sidebar.classList.contains('open')) {
    sidebar.classList.remove('open');
    const overlayId = sidebar.id === 'dashSidebar' ? 'dashOverlay' : 'adminOverlay';
    document.getElementById(overlayId)?.classList.add('hidden');
  }
});

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        if (entry.target.hasAttribute('data-count-to')) {
          animateCountUp(entry.target);
          observer.unobserve(entry.target);
        }
      }
    });
  },
  { threshold: 0.1 }
);

(async () => {
  await loadLayoutPartials();
  setupCookieNotice();
  setupLayoutBindings();
  maybeOpenShopSection();
  try {
    await loadPricingAndApply();
    startPricingPolling();
  } catch (e) {}
  try {
    await checkAuth();
  } finally {
    requestAnimationFrame(setNavReady);
  }
  try {
    await maybeHandlePaymentReturn();
  } catch (e) {}
})();
