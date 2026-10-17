const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let user = null;
let knownPlanIds = new Set();

const notify = (message, error = false) => {
  const toast = $('#appToast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.add('visible');
  clearTimeout(window.__topboxToastTimer);
  window.__topboxToastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
};

const api = async (path, options = {}) => {
  const response = await fetch(path, { credentials: 'same-origin', headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '服务请求失败。');
  return data;
};
const isAdmin = () => user?.role === 'admin' || user?.role === 'super_admin';

const state = () => window.TopBoxApp?.state;
const rerender = () => {
  window.TopBoxApp?.renderSelectors?.();
  document.querySelector('.nav-link.active')?.click();
};

function applyUser(next) {
  user = next;
  const name = user?.nickname || user?.username || '登录';
  $('#accountName').textContent = name;
  $('#accountAvatar').textContent = (name.trim()[0] || 'T').toUpperCase();
  $('#profileUsername').value = user?.username || '';
  $('#profileNickname').value = user?.nickname || '';
  $('#profileAvatar').value = user?.avatar || '';
  $('#adminPanel').classList.toggle('hidden', !isAdmin());
  $('#newAccountRoleWrap').classList.toggle('hidden', user?.role !== 'super_admin');
  $('#archives').classList.toggle('records-readonly', !isAdmin());
}

async function loadBootstrap() {
  const data = await api('/api/bootstrap');
  const appState = state();
  if (!appState) throw new Error('页面初始化失败，请刷新后重试。');
  appState.containers = Array.isArray(data.containers) ? data.containers : [];
  appState.cargo = (Array.isArray(data.cargo) ? data.cargo : []).map(item => ({ ...item, quantity: Math.max(1, +item.quantity || 1) }));
  appState.savedPlans = Array.isArray(data.plans) ? data.plans : [];
  const containerIds = new Set(appState.containers.map(item => item.id));
  const cargoIds = new Set(appState.cargo.map(item => item.id));
  appState.selectedContainers = new Set([...appState.selectedContainers].filter(id => containerIds.has(id)));
  appState.selectedCargo = new Set([...appState.selectedCargo].filter(id => cargoIds.has(id)));
  if (!appState.selectedContainers.size && appState.containers[0]) appState.selectedContainers.add(appState.containers[0].id);
  if (!appState.selectedCargo.size && appState.cargo[0]) appState.selectedCargo.add(appState.cargo[0].id);
  knownPlanIds = new Set(appState.savedPlans.map(item => item.id));
  applyUser(data.user);
  rerender();
}

async function syncSharedRecords() {
  if (!isAdmin() || !state()) return;
  await api('/api/shared/records', { method: 'PUT', body: JSON.stringify({ containers: state().containers, cargo: state().cargo }) });
}

function bindSelectionTooltips() {
  const tooltip = $('#selectionNameTooltip');
  ['#selectedContainerCount', '#selectedCargoCount'].forEach(selector => {
    const badge = $(selector);
    if (!badge || badge.dataset.accountTooltipBound) return;
    badge.dataset.accountTooltipBound = 'true';
    badge.title = '';
    const show = () => {
      const rect = badge.getBoundingClientRect();
      tooltip.textContent = badge.dataset.selectionTooltip || '暂未选择';
      tooltip.style.left = `${Math.max(12, Math.min(window.innerWidth - 380, rect.right - 250))}px`;
      tooltip.style.top = `${Math.min(window.innerHeight - 72, rect.bottom + 8)}px`;
      tooltip.classList.add('visible');
    };
    badge.addEventListener('mouseenter', show);
    badge.addEventListener('focus', show);
    badge.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));
    badge.addEventListener('blur', () => tooltip.classList.remove('visible'));
  });
}

function openAccountPage() {
  $$('.nav-link').forEach(item => item.classList.remove('active'));
  $$('.page').forEach(item => item.classList.toggle('active-page', item.id === 'account'));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (isAdmin()) renderUsers();
}

async function renderUsers() {
  if (!isAdmin()) return;
  try {
    const data = await api('/api/admin/users');
    $('#adminUsersList').innerHTML = data.users.map(account => `<div class="admin-user-row"><div><b>${escapeHtml(account.nickname || account.username)}</b><span> · ${escapeHtml(account.username)} · ${escapeHtml(account.role)}</span></div>${user.role === 'super_admin' && account.role !== 'super_admin' ? `<select data-user-role="${escapeHtml(account.id)}"><option value="user" ${account.role === 'user' ? 'selected' : ''}>普通用户</option><option value="admin" ${account.role === 'admin' ? 'selected' : ''}>管理员</option></select>` : ''}</div>`).join('');
    $$('[data-user-role]').forEach(select => select.addEventListener('change', async () => {
      try { await api('/api/admin/users', { method: 'PATCH', body: JSON.stringify({ id: select.dataset.userRole, role: select.value }) }); notify('权限已更新。'); renderUsers(); }
      catch (error) { notify(error.message, true); renderUsers(); }
    }));
  } catch (error) { notify(error.message, true); }
}

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]); }

function bindEvents() {
  $('#accountMenuButton').addEventListener('click', openAccountPage);
  $('#loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    $('#loginError').textContent = '';
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username: $('#loginUsername').value, password: $('#loginPassword').value }) });
      applyUser(data.user); await loadBootstrap(); $('#authGate').classList.add('is-hidden'); notify('登录成功。');
    } catch (error) { $('#loginError').textContent = error.message; }
  });
  $('#logoutButton').addEventListener('click', async () => { try { await api('/api/auth/logout', { method: 'POST' }); } catch {} location.reload(); });
  $('#profileForm').addEventListener('submit', async event => {
    event.preventDefault();
    try { const data = await api('/api/profile', { method: 'PATCH', body: JSON.stringify({ nickname: $('#profileNickname').value, avatar: $('#profileAvatar').value }) }); applyUser(data.user); notify('个人资料已保存。'); }
    catch (error) { notify(error.message, true); }
  });
  $('#passwordForm').addEventListener('submit', async event => {
    event.preventDefault();
    try { await api('/api/profile/password', { method: 'PATCH', body: JSON.stringify({ oldPassword: $('#oldPassword').value, newPassword: $('#newPassword').value }) }); event.target.reset(); notify('密码已更新。'); }
    catch (error) { notify(error.message, true); }
  });
  $('#createUserForm').addEventListener('submit', async event => {
    event.preventDefault();
    try { await api('/api/admin/users', { method: 'POST', body: JSON.stringify({ username: $('#newAccountUsername').value, nickname: $('#newAccountNickname').value, password: $('#newAccountPassword').value, role: user?.role === 'super_admin' ? $('#newAccountRole').value : 'user' }) }); event.target.reset(); notify('账号已创建。'); renderUsers(); }
    catch (error) { notify(error.message, true); }
  });
  document.addEventListener('click', event => {
    const archiveAction = event.target.closest('#archives [data-delete], #bulkDeleteArchive');
    if (!user) return;
    if (!isAdmin() && event.target.closest('#archives [data-edit], #archives [data-delete], #addArchive, #bulkDeleteArchive, .file-button')) { event.preventDefault(); event.stopImmediatePropagation(); notify('共享档案仅可由管理员维护。', true); return; }
    if (isAdmin() && archiveAction) setTimeout(() => syncSharedRecords().catch(error => notify(error.message, true)), 0);
  }, true);
  $('#archiveForm').addEventListener('submit', () => setTimeout(() => syncSharedRecords().catch(error => notify(error.message, true)), 0));
  $('#importFile').addEventListener('change', () => setTimeout(() => syncSharedRecords().catch(error => notify(error.message, true)), 300));
  $('#appDialogForm').addEventListener('submit', () => setTimeout(async () => {
    const appState = state(); if (!appState) return;
    const candidate = appState.savedPlans.find(item => !knownPlanIds.has(item.id));
    if (!candidate) return;
    try { const remote = await api('/api/plans', { method: 'POST', body: JSON.stringify({ plan: candidate }) }); candidate.id = remote.id; knownPlanIds.add(remote.id); notify('方案已安全保存。'); }
    catch (error) { notify(error.message, true); }
  }, 0));
  $('#bulkDeletePlans').addEventListener('click', () => setTimeout(() => {
    const appState = state(); if (!appState) return;
    const stillSaved = new Set(appState.savedPlans.map(item => item.id));
    [...knownPlanIds].filter(id => !stillSaved.has(id)).forEach(id => api(`/api/plans/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {}));
    knownPlanIds = stillSaved;
  }, 0));
}

async function start() {
  for (let attempt = 0; attempt < 50 && !window.TopBoxApp; attempt += 1) await new Promise(resolve => setTimeout(resolve, 50));
  bindEvents();
  try { await loadBootstrap(); $('#authGate').classList.add('is-hidden'); }
  catch { /* No session: the login gate remains visible. */ }
  bindSelectionTooltips();
  setInterval(bindSelectionTooltips, 700);
}

start();

