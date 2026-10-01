// ===== AUTH TABS =====
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const isLogin = tab.dataset.tab === 'login';
    document.getElementById('login-form').style.display = isLogin ? 'flex' : 'none';
    document.getElementById('register-form').style.display = isLogin ? 'none' : 'flex';
  });
});

async function doRegister() {
  const username = document.getElementById('reg-user').value.trim();
  const err = document.getElementById('reg-error');
  err.textContent = '';
  if (username.length < 3) {
    err.textContent = 'Mínimo 3 caracteres';
    return;
  }
  const fd = new FormData();
  fd.append('username', username);
  const res = await fetch('/register', { method: 'POST', body: fd });
  const data = await res.json();
  if (data.ok) {
    location.reload();
  } else {
    err.textContent = data.error || 'Error';
  }
}

async function doLogin() {
  const username = document.getElementById('login-user').value.trim();
  const err = document.getElementById('login-error');
  err.textContent = '';
  const fd = new FormData();
  fd.append('username', username);
  const res = await fetch('/login', { method: 'POST', body: fd });
  const data = await res.json();
  if (data.ok) {
    location.reload();
  } else {
    err.textContent = data.error || 'Error';
  }
}

// ===== CLAIM =====
async function claimCode() {
  const code = document.getElementById('claim-code').value.trim();
  const msg = document.getElementById('claim-msg');
  msg.textContent = '';
  msg.className = 'msg';
  if (!code) return;

  const fd = new FormData();
  fd.append('code', code);
  const res = await fetch('/claim', { method: 'POST', body: fd });
  const data = await res.json();
  if (data.ok) {
    msg.textContent = data.message;
    msg.classList.add('success');
    updateCoins(data.total);
    document.getElementById('claim-code').value = '';
  } else {
    msg.textContent = data.error;
    msg.classList.add('error');
  }
}

// ===== COINS =====
function updateCoins(n) {
  const el = document.getElementById('coin-count');
  const el2 = document.getElementById('display-coins');
  if (el) el.textContent = n;
  if (el2) el2.textContent = String(n).padStart(4, '0');
}

// ===== SLOT MACHINE =====
const REEL_SYMBOLS = ['pikachu', 'squirtle', 'charmander', 'bulbasaur', 'eevee', 'cherry', 'seven'];

function buildReel(innerEl) {
  // Build a long strip of symbols for spinning effect
  let html = '';
  // Repeat many times for continuous scroll feel
  for (let i = 0; i < 30; i++) {
    const id = REEL_SYMBOLS[i % REEL_SYMBOLS.length];
    const s = SYMBOL_MAP[id];
    html += `<div class="symbol" data-id="${id}">
      <span>${s.emoji}</span>
      <span class="sym-name">${s.name}</span>
    </div>`;
  }
  innerEl.innerHTML = html;
}

function initReels() {
  ['reel1-inner', 'reel2-inner', 'reel3-inner'].forEach(id => {
    const el = document.getElementById(id);
    if (el) buildReel(el);
  });
  // Set initial random positions
  setReelPosition('reel1-inner', REEL_SYMBOLS[Math.floor(Math.random() * 7)], false);
  setReelPosition('reel2-inner', REEL_SYMBOLS[Math.floor(Math.random() * 7)], false);
  setReelPosition('reel3-inner', REEL_SYMBOLS[Math.floor(Math.random() * 7)], false);
}

function setReelPosition(innerId, symbolId, animate = true) {
  const inner = document.getElementById(innerId);
  if (!inner) return;
  const symbols = inner.querySelectorAll('.symbol');
  // Find a symbol near the middle of the strip
  let targetIndex = -1;
  for (let i = 10; i < symbols.length - 5; i++) {
    if (symbols[i].dataset.id === symbolId) {
      targetIndex = i;
      break;
    }
  }
  if (targetIndex < 0) targetIndex = 12;

  const symbolHeight = symbols[0].offsetHeight || 110;
  const offset = targetIndex * symbolHeight;

  if (animate) {
    inner.style.transition = 'transform 1.8s cubic-bezier(0.15, 0.85, 0.35, 1)';
  } else {
    inner.style.transition = 'none';
  }
  inner.style.transform = `translateY(-${offset}px)`;
}

function animateSpin(reelId, finalSymbol, delay) {
  return new Promise(resolve => {
    const inner = document.getElementById(reelId + '-inner');
    const reel = document.getElementById(reelId);
    reel.classList.add('spinning');

    // Fast random spinning
    let pos = 0;
    const symbolHeight = 110;
    const interval = setInterval(() => {
      pos += symbolHeight * 1.5;
      inner.style.transition = 'none';
      inner.style.transform = `translateY(-${pos % (symbolHeight * 7)}px)`;
    }, 50);

    setTimeout(() => {
      clearInterval(interval);
      reel.classList.remove('spinning');
      setReelPosition(reelId + '-inner', finalSymbol, true);
      setTimeout(resolve, 1900);
    }, delay);
  });
}

let spinning = false;

async function spin(multi) {
  if (spinning) return;
  spinning = true;

  const btn1 = document.getElementById('spin-1');
  const btn10 = document.getElementById('spin-10');
  btn1.disabled = true;
  btn10.disabled = true;

  const resultEl = document.getElementById('spin-result');
  resultEl.textContent = multi > 1 ? 'Girando ×10...' : 'Girando...';
  resultEl.className = 'spin-result';

  const fd = new FormData();
  fd.append('multi', multi);
  const res = await fetch('/spin', { method: 'POST', body: fd });
  const data = await res.json();

  if (!data.ok) {
    resultEl.textContent = data.error;
    resultEl.classList.add('error');
    spinning = false;
    btn1.disabled = false;
    btn10.disabled = false;
    return;
  }

  // Animate only the last spin for visual (or first)
  const last = data.results[data.results.length - 1];
  await Promise.all([
    animateSpin('reel1', last.reels[0], 600),
    animateSpin('reel2', last.reels[1], 1000),
    animateSpin('reel3', last.reels[2], 1400),
  ]);

  updateCoins(data.new_balance);

  // Show results
  if (data.prizes_won && data.prizes_won.length > 0) {
    const names = data.prizes_won.map(p => p.prize).join(', ');
    resultEl.textContent = `🎉 ¡GANASTE: ${names}!`;
    resultEl.classList.add('win');
    loadMyWins();
  } else if (data.extra_coins > 0) {
    resultEl.textContent = `🍒 +${data.extra_coins} monedas extra!`;
    resultEl.classList.add('win');
  } else {
    resultEl.textContent = multi > 1
      ? `Terminaste ${multi} tiradas. ¡Seguí intentando!`
      : 'Sin premio esta vez. ¡Probá de nuevo!';
  }

  spinning = false;
  btn1.disabled = false;
  btn10.disabled = false;
}

// ===== WINS =====
async function loadMyWins() {
  const res = await fetch('/api/me');
  const data = await res.json();
  if (!data.ok) return;

  updateCoins(data.coins);
  const list = document.getElementById('wins-list');
  if (!data.wins || data.wins.length === 0) {
    list.innerHTML = '<p class="subtitle">Todavía no ganaste premios</p>';
    return;
  }

  list.innerHTML = data.wins.map(w => `
    <div class="win-item">
      <div>
        <div class="prize">${w.prize_name}</div>
        <div class="date">${w.combination} · ${w.delivered ? '✅ Entregado' : '⏳ Pendiente'}</div>
      </div>
    </div>
  `).join('');
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  initReels();
  if (document.getElementById('user-area') && document.getElementById('user-area').style.display !== 'none') {
    loadMyWins();
  }

  // Enter key support
  document.getElementById('login-user')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
  document.getElementById('reg-user')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doRegister();
  });
  document.getElementById('claim-code')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') claimCode();
  });
});
