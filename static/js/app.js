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

function symbolHTML(id) {
  const s = SYMBOL_MAP[id];
  if (!s) return '<div class="symbol"><span>?</span></div>';
  return '<div class="symbol" data-id="' + id + '"><img src="' + s.img + '" alt="' + s.name + '" class="sym-img" draggable="false"></div>';
}

function buildReel(innerEl) {
  let html = '';
  for (let i = 0; i < 40; i++) {
    const id = REEL_SYMBOLS[i % REEL_SYMBOLS.length];
    html += symbolHTML(id);
  }
  innerEl.innerHTML = html;
}

function initReels() {
  ['reel1-inner', 'reel2-inner', 'reel3-inner'].forEach(id => {
    const el = document.getElementById(id);
    if (el) buildReel(el);
  });
  setReelPosition('reel1-inner', REEL_SYMBOLS[Math.floor(Math.random() * 7)], false);
  setReelPosition('reel2-inner', REEL_SYMBOLS[Math.floor(Math.random() * 7)], false);
  setReelPosition('reel3-inner', REEL_SYMBOLS[Math.floor(Math.random() * 7)], false);
}

function getSymbolHeight() {
  const sample = document.querySelector('.symbol');
  return sample ? sample.offsetHeight : 110;
}

function setReelPosition(innerId, symbolId, animate) {
  const inner = document.getElementById(innerId);
  if (!inner) return;
  const symbols = inner.querySelectorAll('.symbol');
  let targetIndex = -1;
  for (let i = 12; i < symbols.length - 5; i++) {
    if (symbols[i].dataset.id === symbolId) {
      targetIndex = i;
      break;
    }
  }
  if (targetIndex < 0) targetIndex = 14;

  const symbolHeight = getSymbolHeight();
  const offset = targetIndex * symbolHeight;

  if (animate) {
    inner.style.transition = 'transform 1.4s cubic-bezier(0.12, 0.8, 0.3, 1)';
  } else {
    inner.style.transition = 'none';
  }
  inner.style.transform = 'translateY(-' + offset + 'px)';
}

function animateSpin(reelId, finalSymbol, delay) {
  return new Promise(function(resolve) {
    const inner = document.getElementById(reelId + '-inner');
    const reel = document.getElementById(reelId);
    if (!inner || !reel) { resolve(); return; }

    reel.classList.add('spinning');
    let pos = 0;
    const symbolHeight = getSymbolHeight();
    const interval = setInterval(function() {
      pos += symbolHeight * 1.2;
      inner.style.transition = 'none';
      inner.style.transform = 'translateY(-' + (pos % (symbolHeight * 7)) + 'px)';
    }, 40);

    setTimeout(function() {
      clearInterval(interval);
      reel.classList.remove('spinning');
      setReelPosition(reelId + '-inner', finalSymbol, true);
      setTimeout(resolve, 1500);
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
  resultEl.textContent = multi > 1 ? 'Girando 1/' + multi + '...' : 'Girando...';
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

  const allPrizes = [];

  for (let i = 0; i < data.results.length; i++) {
    const r = data.results[i];
    if (multi > 1) {
      resultEl.textContent = 'Tirada ' + (i + 1) + '/' + multi + '...';
      resultEl.className = 'spin-result';
    }

    await Promise.all([
      animateSpin('reel1', r.reels[0], 500),
      animateSpin('reel2', r.reels[1], 850),
      animateSpin('reel3', r.reels[2], 1200),
    ]);

    if (r.prize) {
      allPrizes.push(r.prize);
      resultEl.textContent = '🎉 ¡' + r.prize + '!';
      resultEl.className = 'spin-result win';
      await new Promise(function(r) { setTimeout(r, 900); });
    } else if (r.extra_coins) {
      resultEl.textContent = '🍒 +' + r.extra_coins + ' monedas';
      resultEl.className = 'spin-result win';
      await new Promise(function(r) { setTimeout(r, 700); });
    } else if (multi > 1) {
      await new Promise(function(r) { setTimeout(r, 250); });
    }
  }

  updateCoins(data.new_balance);

  if (allPrizes.length > 0) {
    resultEl.textContent = '🎉 ¡GANASTE: ' + allPrizes.join(', ') + '!';
    resultEl.classList.add('win');
    loadMyWins();
  } else if (data.extra_coins > 0) {
    resultEl.textContent = '🍒 +' + data.extra_coins + ' monedas extra!';
    resultEl.classList.add('win');
  } else {
    resultEl.textContent = multi > 1
      ? 'Terminaste ' + multi + ' tiradas. ¡Seguí intentando!'
      : 'Sin premio esta vez. ¡Probá de nuevo!';
  }

  spinning = false;
  btn1.disabled = false;
  btn10.disabled = false;
}

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

  list.innerHTML = data.wins.map(function(w) {
    return '<div class="win-item"><div><div class="prize">' + w.prize_name + '</div><div class="date">' + w.combination + ' · ' + (w.delivered ? '✅ Entregado' : '⏳ Pendiente') + '</div></div></div>';
  }).join('');
}

document.addEventListener('DOMContentLoaded', function() {
  initReels();
  if (document.getElementById('user-area') && document.getElementById('user-area').style.display !== 'none') {
    loadMyWins();
  }

  document.getElementById('login-user') && document.getElementById('login-user').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') doLogin();
  });
  document.getElementById('reg-user') && document.getElementById('reg-user').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') doRegister();
  });
  document.getElementById('claim-code') && document.getElementById('claim-code').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') claimCode();
  });
});
