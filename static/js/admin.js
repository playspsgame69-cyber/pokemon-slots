// Tabs
document.querySelectorAll('.admin-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('panel-' + tab.dataset.panel).classList.add('active');

    // Auto load data
    if (tab.dataset.panel === 'codes') loadCodes();
    if (tab.dataset.panel === 'wins') loadWins();
    if (tab.dataset.panel === 'users') loadUsers();
    if (tab.dataset.panel === 'prizes') loadPrizes();
    if (tab.dataset.panel === 'settings') loadSettings();
  });
});

let lastQR = null;

async function generateCode() {
  const coins = parseInt(document.getElementById('gen-coins').value) || 10;
  const note = document.getElementById('gen-note').value;
  const fd = new FormData();
  fd.append('coins', coins);
  fd.append('note', note);

  const res = await fetch('/admin/generate', { method: 'POST', body: fd });
  const data = await res.json();
  if (!data.ok) {
    alert(data.error || 'Error');
    return;
  }

  lastQR = data;
  document.getElementById('gen-code-text').textContent = data.code;
  document.getElementById('gen-qr-img').src = 'data:image/png;base64,' + data.qr;
  document.getElementById('qr-result').style.display = 'block';
}

function downloadQR() {
  if (!lastQR) return;
  const a = document.createElement('a');
  a.href = 'data:image/png;base64,' + lastQR.qr;
  a.download = `QR_${lastQR.code}_${lastQR.coins}monedas.png`;
  a.click();
}

async function loadCodes() {
  const res = await fetch('/admin/codes');
  const data = await res.json();
  const el = document.getElementById('codes-list');
  if (!data.codes.length) {
    el.innerHTML = '<p class="subtitle">No hay códigos todavía</p>';
    return;
  }
  el.innerHTML = `
    <table>
      <thead><tr><th>Código</th><th>Monedas</th><th>Estado</th><th>Nota</th></tr></thead>
      <tbody>
        ${data.codes.map(c => `
          <tr>
            <td><code>${c.code}</code></td>
            <td>${c.coins_amount}</td>
            <td>${c.used_by
              ? `<span class="badge used">Usado por ${c.username || '?'}</span>`
              : `<span class="badge free">Disponible</span>`}
            </td>
            <td>${c.note || '-'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function loadWins() {
  const res = await fetch('/admin/wins');
  const data = await res.json();
  const el = document.getElementById('wins-admin-list');
  if (!data.wins.length) {
    el.innerHTML = '<p class="subtitle">Nadie ganó premios todavía</p>';
    return;
  }
  el.innerHTML = `
    <table>
      <thead><tr><th>Usuario</th><th>Premio</th><th>Fecha</th><th>Estado</th></tr></thead>
      <tbody>
        ${data.wins.map(w => `
          <tr>
            <td>${w.username}</td>
            <td><strong>${w.prize_name}</strong><br><small>${w.combination}</small></td>
            <td>${(w.created_at || '').slice(0, 16).replace('T', ' ')}</td>
            <td>
              ${w.delivered
                ? '<span class="badge delivered">Entregado</span>'
                : `<button class="btn-sm" onclick="markDelivered(${w.id})">Marcar entregado</button>`}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function markDelivered(id) {
  const fd = new FormData();
  fd.append('win_id', id);
  await fetch('/admin/mark_delivered', { method: 'POST', body: fd });
  loadWins();
}

async function loadUsers() {
  const res = await fetch('/admin/users');
  const data = await res.json();
  const el = document.getElementById('users-list');
  if (!data.users.length) {
    el.innerHTML = '<p class="subtitle">No hay usuarios</p>';
    return;
  }
  el.innerHTML = `
    <table>
      <thead><tr><th>Usuario</th><th>Monedas</th><th>Desde</th></tr></thead>
      <tbody>
        ${data.users.map(u => `
          <tr>
            <td>${u.username}</td>
            <td>🪙 ${u.coins}</td>
            <td>${(u.created_at || '').slice(0, 10)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function loadPrizes() {
  const res = await fetch('/admin/prizes');
  const data = await res.json();
  const el = document.getElementById('prizes-list');
  el.innerHTML = `
    <table>
      <thead><tr><th>Combinación</th><th>Premio</th><th>Activo</th></tr></thead>
      <tbody>
        ${data.prizes.map(p => `
          <tr>
            <td><code>${p.combination}</code></td>
            <td>${p.prize_name}<br><small>${p.description || ''}</small></td>
            <td>${p.active ? '✅' : '❌'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function savePrize() {
  const fd = new FormData();
  fd.append('combination', document.getElementById('prize-comb').value);
  fd.append('prize_name', document.getElementById('prize-name').value);
  fd.append('description', document.getElementById('prize-desc').value);
  fd.append('active', document.getElementById('prize-active').checked ? 1 : 0);
  const res = await fetch('/admin/prize', { method: 'POST', body: fd });
  const data = await res.json();
  if (data.ok) {
    loadPrizes();
    alert('Premio guardado');
  }
}

async function loadSettings() {
  const res = await fetch('/admin/settings');
  const data = await res.json();
  if (data.ok) {
    document.getElementById('discord-webhook').value = data.discord_webhook || '';
  }
}

async function saveSettings() {
  const fd = new FormData();
  fd.append('discord_webhook', document.getElementById('discord-webhook').value);
  fd.append('new_password', document.getElementById('new-admin-pass').value);
  const res = await fetch('/admin/settings', { method: 'POST', body: fd });
  const data = await res.json();
  const msg = document.getElementById('settings-msg');
  if (data.ok) {
    msg.textContent = 'Guardado correctamente';
    msg.className = 'msg success';
    document.getElementById('new-admin-pass').value = '';
  } else {
    msg.textContent = 'Error al guardar';
    msg.className = 'msg error';
  }
}

async function testWebhook() {
  const msg = document.getElementById('settings-msg');
  msg.textContent = 'Enviando prueba...';
  msg.className = 'msg';
  // Guardar primero por si cambió la URL
  await saveSettings();
  const res = await fetch('/admin/test-webhook', { method: 'POST' });
  const data = await res.json();
  if (data.ok) {
    msg.textContent = data.message || 'Mensaje enviado a Discord ✅';
    msg.className = 'msg success';
  } else {
    msg.textContent = 'Error: ' + (data.error || 'No se pudo enviar');
    msg.className = 'msg error';
  }
}
