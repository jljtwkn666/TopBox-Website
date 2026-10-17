const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
// app.js contains a few legacy UI callbacks that are evaluated from a different
// module scope. Keep a global translation fallback available while the page is
// being hydrated after sign-in so those callbacks cannot interrupt login.
globalThis.t ??= text => String(text ?? '');
let user = null;
let knownPlanIds = new Set();
let pendingAvatar = '';

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
const canEditRecords = () => isAdmin() || Boolean(user?.permissions?.records);
const canViewUpdates = () => isAdmin() || Boolean(user?.permissions?.updates);

const state = () => window.TopBoxApp?.state;
const rerender = () => {
  window.TopBoxApp?.renderSelectors?.();
  window.TopBoxApp?.renderArchives?.();
  window.TopBoxApp?.renderSavedPlans?.();
};

function applyUserRecords(data) {
  const appState = state();
  if (!appState) throw new Error('页面初始化失败，请刷新后重试。');
  const quantities = new Map(appState.cargo.map(item => [item.id, { quantity: item.quantity, pieceQuantity: item.pieceQuantity }]));
  appState.containers = Array.isArray(data.containers) ? data.containers : [];
  appState.cargo = (Array.isArray(data.cargo) ? data.cargo : []).map(item => ({ ...item, ...(quantities.get(item.id) || {}), quantity: Math.max(1, +(quantities.get(item.id)?.quantity ?? item.quantity) || 1) }));
  const containerIds = new Set(appState.containers.map(item => item.id));
  const cargoIds = new Set(appState.cargo.map(item => item.id));
  appState.selectedContainers = new Set([...appState.selectedContainers].filter(id => containerIds.has(id)));
  appState.selectedCargo = new Set([...appState.selectedCargo].filter(id => cargoIds.has(id)));
  if (!appState.selectedContainers.size && appState.containers[0]) appState.selectedContainers.add(appState.containers[0].id);
  if (!appState.selectedCargo.size && appState.cargo[0]) appState.selectedCargo.add(appState.cargo[0].id);
  return appState;
}

function applyUser(next) {
  user = next;
  const name = user?.nickname || user?.username || '登录';
  $('#accountName').textContent = name;
  const avatar = user?.avatar || '';
  const avatarNode = $('#accountAvatar');
  avatarNode.replaceChildren();
  if (/^(data:image\/(png|jpe?g|webp);base64,|https:\/\/)/i.test(avatar)) {
    const image = document.createElement('img'); image.src = avatar; image.alt = ''; avatarNode.append(image);
  } else avatarNode.textContent = (name.trim()[0] || 'T').toUpperCase();
  $('#profileUsername').value = user?.username || '';
  $('#profileNickname').value = user?.nickname || '';
  pendingAvatar = avatar;
  const preview = $('#profileAvatarPreview');
  preview.src = avatar || ''; preview.classList.toggle('hidden', !avatar);
  $('#adminPanel').classList.toggle('hidden', !isAdmin());
  $('#newAccountRoleWrap').classList.toggle('hidden', user?.role !== 'super_admin');
  $('#archives').classList.toggle('records-readonly', !canEditRecords());
  const updatesButton = $('.nav-link[data-page="updates"]');
  updatesButton?.classList.toggle('permission-hidden', !canViewUpdates());
  $('#updates').classList.toggle('permission-hidden', !canViewUpdates());
  if (!canViewUpdates() && updatesButton?.classList.contains('active')) $('.nav-link[data-page="workspace"]')?.click();
}

async function loadBootstrap() {
  const data = await api('/api/bootstrap');
  const appState = applyUserRecords(data);
  appState.savedPlans = Array.isArray(data.plans) ? data.plans : [];
  knownPlanIds = new Set(appState.savedPlans.map(item => item.id));
  applyUser(data.user);
  requestAnimationFrame(() => { rerender(); requestAnimationFrame(rerender); });
}

async function refreshUserRecords() {
  if (!user) return;
  const data = await api('/api/shared/records');
  applyUserRecords(data);
  rerender();
}

async function syncUserRecords() {
  if (!state()) return;
  await api('/api/shared/records', { method: 'PUT', body: JSON.stringify({ containers: state().containers, cargo: state().cargo }) });
  await refreshUserRecords();
}

function bindSelectionTooltips() {
  const tooltip = $('#selectionNameTooltip');
  ['#selectedContainerCount', '#selectedCargoCount'].forEach(selector => {
    const badge = $(selector);
    if (!badge || badge.dataset.accountTooltipBound) return;
    badge.dataset.accountTooltipBound = 'true';
    badge.title = '';
    const selectionText = () => {
      const appState = state(); if (!appState) return '暂未选择';
      const records = badge.id === 'selectedContainerCount' ? appState.containers : appState.cargo;
      const ids = badge.id === 'selectedContainerCount' ? appState.selectedContainers : appState.selectedCargo;
      const names = records.filter(item => ids.has(item.id)).map(item => item.name);
      return names.join('、') || '暂未选择';
    };
    const show = event => {
      const rect = badge.getBoundingClientRect(), x = event?.clientX || rect.left + rect.width / 2, y = event?.clientY || rect.bottom;
      tooltip.textContent = selectionText();
      tooltip.style.left = `${Math.max(12, Math.min(window.innerWidth - 380, x + 12))}px`;
      tooltip.style.top = `${Math.min(window.innerHeight - 68, y + 12)}px`;
      tooltip.classList.add('visible');
    };
    badge.addEventListener('mouseenter', show);
    badge.addEventListener('mousemove', show);
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
    $('#adminUsersList').innerHTML = data.users.map(account => {
      // Administrators always retain their management capabilities; feature
      // switches are intentionally scoped to ordinary user accounts.
      const editablePermissions = account.role === 'user';
      const editableProfile = account.role !== 'super_admin' && (user.role === 'super_admin' || account.role === 'user');
      const permissionControls = editablePermissions ? `<div class="permission-switches"><label><input data-user-permission="${escapeHtml(account.id)}" data-permission="records" type="checkbox" ${account.permissions?.records ? 'checked' : ''}> 档案维护</label><label><input data-user-permission="${escapeHtml(account.id)}" data-permission="updates" type="checkbox" ${account.permissions?.updates ? 'checked' : ''}> 更新日志</label></div>` : '';
      const roleControl = user.role === 'super_admin' && account.role !== 'super_admin' ? `<select data-user-role="${escapeHtml(account.id)}"><option value="user" ${account.role === 'user' ? 'selected' : ''}>普通用户</option><option value="admin" ${account.role === 'admin' ? 'selected' : ''}>管理员</option></select>` : '';
      const profileControls = editableProfile ? `<div class="user-edit-fields"><input data-user-username="${escapeHtml(account.id)}" value="${escapeHtml(account.username)}" aria-label="用户名"><input data-user-nickname="${escapeHtml(account.id)}" value="${escapeHtml(account.nickname || '')}" aria-label="昵称"><input data-user-password="${escapeHtml(account.id)}" type="password" placeholder="新密码（留空不修改）" aria-label="新密码"><button type="button" class="button secondary" data-save-user="${escapeHtml(account.id)}">保存用户</button></div>` : '';
      const deletable = account.role !== 'super_admin' && (user.role === 'super_admin' || account.role === 'user');
      const deleteControl = deletable ? `<button type="button" class="text-button delete-user" data-delete-user="${escapeHtml(account.id)}">删除用户</button>` : '';
      return `<div class="admin-user-row"><div><b>${escapeHtml(account.nickname || account.username)}</b><span> · ${escapeHtml(account.username)} · ${escapeHtml(account.role)}</span>${profileControls}${permissionControls}</div><div class="user-row-actions">${roleControl}${deleteControl}</div></div>`;
    }).join('');
    $$('[data-user-role]').forEach(select => select.addEventListener('change', async () => {
      const permissions = $$(`[data-user-permission="${select.dataset.userRole}"]`).reduce((value, input) => ({ ...value, [input.dataset.permission]: input.checked }), {});
      try { await api('/api/admin/users', { method: 'PATCH', body: JSON.stringify({ id: select.dataset.userRole, role: select.value, permissions }) }); notify('权限已更新。'); renderUsers(); }
      catch (error) { notify(error.message, true); renderUsers(); }
    }));
    $$('[data-user-permission]').forEach(input => input.addEventListener('change', async () => {
      const permissions = $$(`[data-user-permission="${input.dataset.userPermission}"]`).reduce((value, item) => ({ ...value, [item.dataset.permission]: item.checked }), {});
      const role = $(`[data-user-role="${input.dataset.userPermission}"]`)?.value;
      try { await api('/api/admin/users', { method: 'PATCH', body: JSON.stringify({ id: input.dataset.userPermission, ...(role ? { role } : {}), permissions }) }); notify('权限已更新。'); renderUsers(); }
      catch (error) { notify(error.message, true); renderUsers(); }
    }));
    $$('[data-save-user]').forEach(button => button.addEventListener('click', async () => {
      const id = button.dataset.saveUser, permissions = $$(`[data-user-permission="${id}"]`).reduce((value, item) => ({ ...value, [item.dataset.permission]: item.checked }), {}), role = $(`[data-user-role="${id}"]`)?.value;
      const password = $(`[data-user-password="${id}"]`)?.value || '';
      try { await api('/api/admin/users', { method: 'PATCH', body: JSON.stringify({ id, ...(role ? { role } : {}), username: $(`[data-user-username="${id}"]`)?.value, nickname: $(`[data-user-nickname="${id}"]`)?.value, password, permissions }) }); notify('用户资料已更新。'); renderUsers(); }
      catch (error) { notify(error.message, true); }
    }));
    $$('[data-delete-user]').forEach(button => button.addEventListener('click', async () => {
      if (button.dataset.confirming !== 'true') { button.dataset.confirming = 'true'; button.textContent = '再次点击确认删除'; setTimeout(() => { if (button.dataset.confirming === 'true') { button.dataset.confirming = ''; button.textContent = '删除用户'; } }, 3000); return; }
      try { await api(`/api/admin/users/${encodeURIComponent(button.dataset.deleteUser)}`, { method: 'DELETE' }); notify('用户已删除。'); renderUsers(); }
      catch (error) { notify(error.message, true); }
    }));
  } catch (error) { notify(error.message, true); }
}

function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[c]); }

async function compactAvatar(file) {
  if (!file || !/^image\/(png|jpe?g|webp)$/.test(file.type)) throw new Error('请选择 PNG、JPG 或 WEBP 图片。');
  if (file.size > 8 * 1024 * 1024) throw new Error('头像图片不能超过 8 MB。');
  const source = await new Promise((resolve, reject) => { const image = new Image(), url = URL.createObjectURL(file); image.onload = () => { URL.revokeObjectURL(url); resolve(image); }; image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('头像图片无法读取。')); }; image.src = url; });
  const scale = Math.min(1, 360 / Math.max(source.naturalWidth, source.naturalHeight)), canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(source.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', .82);
}

let shareAction = null;
async function regenerateShareCode() {
  const appState = state(); if (!shareAction || !appState) return;
  const payload = shareAction.kind === 'plans' ? appState.savedPlans : appState[shareAction.kind];
  const input = $('#shareCodeInput');
  $('#shareConfirm').disabled = true;
  $('#shareMessage').textContent = '正在随机生成可用分享码…';
  try {
    const result = await api('/api/shares', { method: 'POST', body: JSON.stringify({ kind: shareAction.kind, payload }) });
    input.value = result.code; input.readOnly = true;
    $('#shareMessage').textContent = `分享码已生成：${result.code}\n有效至 ${new Date(result.expiresAt).toLocaleString('zh-CN')}。`;
  } finally { $('#shareConfirm').disabled = false; }
}
function openShareDialog(mode, kind) {
  const dialog = $('#shareDialog'), input = $('#shareCodeInput');
  shareAction = { mode, kind };
  $('#shareTitle').textContent = mode === 'create' ? '生成数据分享码' : '导入数据分享码';
  $('#shareMessage').textContent = mode === 'create' ? '正在自动生成有效期 30 天的分享码。' : '输入或粘贴其他用户提供的分享码。导入前会显示数据类别和数量。';
  input.value = ''; input.readOnly = mode === 'create';
  const appendMode = $('input[name="shareImportMode"][value="append"]'); if (appendMode) appendMode.checked = true;
  $('#shareImportMode').classList.add('hidden');
  $('#shareCopy').classList.toggle('hidden', mode !== 'create');
  $('#shareConfirm').textContent = mode === 'create' ? '随机生成' : '下一步';
  dialog.showModal();
  if (mode === 'create') regenerateShareCode().catch(error => { $('#shareMessage').textContent = error.message; });
}
async function handleShareDialog() {
  const appState = state(); if (!shareAction || !appState) return;
  const input = $('#shareCodeInput');
  if (shareAction.mode === 'create') {
    await regenerateShareCode(); return;
  }
  if (shareAction.mode === 'import') {
    const code = input.value.trim(); if (!code) throw new Error('请输入分享码。');
    const preview = await api(`/api/shares/${encodeURIComponent(code)}`);
    shareAction = { mode: 'confirm', code, kind: preview.kind };
    $('#shareMessage').textContent = `即将导入 ${preview.count} 条${preview.kind === 'plans' ? '装车方案' : preview.kind === 'containers' ? '容器档案' : '货物档案'}。确认后将加入当前账号的数据。`;
    input.readOnly = true; $('#shareImportMode').classList.remove('hidden'); $('#shareConfirm').textContent = '确认导入'; return;
  }
  const importMode = $('input[name="shareImportMode"]:checked')?.value || 'append';
  const result = await api(`/api/shares/${encodeURIComponent(shareAction.code)}/import`, { method: 'POST', body: JSON.stringify({ mode: importMode }) });
  $('#shareDialog').close(); await loadBootstrap(); notify(`已导入 ${result.count} 条数据。`);
}

function bindEvents() {
  $('#accountMenuButton').addEventListener('click', openAccountPage);
  $('#shareClose').addEventListener('click', () => $('#shareDialog').close());
  $('#shareCancel').addEventListener('click', () => $('#shareDialog').close());
  $('#shareCopy').addEventListener('click', async () => { const code = $('#shareCodeInput').value; if (!code) return; try { await navigator.clipboard.writeText(code); notify('分享码已复制。'); } catch { $('#shareCodeInput').select(); document.execCommand('copy'); notify('分享码已复制。'); } });
  $('#shareForm').addEventListener('submit', async event => { event.preventDefault(); try { await handleShareDialog(); } catch (error) { notify(error.message, true); } });
  $('#shareArchives').addEventListener('click', () => openShareDialog('create', state()?.archive === 'cargo' ? 'cargo' : 'containers'));
  $('#importArchiveShare').addEventListener('click', () => openShareDialog('import', 'archives'));
  $('#sharePlans').addEventListener('click', () => openShareDialog('create', 'plans'));
  $('#importPlanShare').addEventListener('click', () => openShareDialog('import', 'plans'));
  $('#toggleLoginPassword').addEventListener('click', () => { const input = $('#loginPassword'), visible = input.type === 'text'; input.type = visible ? 'password' : 'text'; $('#toggleLoginPassword').textContent = visible ? '◉' : '◉̸'; $('#toggleLoginPassword').setAttribute('aria-label', visible ? '显示密码' : '隐藏密码'); });
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
    try { const data = await api('/api/profile', { method: 'PATCH', body: JSON.stringify({ nickname: $('#profileNickname').value, avatar: pendingAvatar }) }); applyUser(data.user); $('#profileAvatarFile').value = ''; notify('个人资料已保存。'); }
    catch (error) { notify(error.message, true); }
  });
  $('#profileAvatarFile').addEventListener('change', async event => { try { pendingAvatar = await compactAvatar(event.target.files?.[0]); const preview = $('#profileAvatarPreview'); preview.src = pendingAvatar; preview.classList.remove('hidden'); } catch (error) { event.target.value = ''; notify(error.message, true); } });
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
    if (!user) return;
    if (!canEditRecords() && event.target.closest('#archives [data-edit], #archives [data-delete], #addArchive, #bulkDeleteArchive, .file-button')) { event.preventDefault(); event.stopImmediatePropagation(); notify('未获档案维护权限。', true); return; }
  }, true);
  $$('.nav-link').forEach(button => button.addEventListener('click', () => setTimeout(() => loadBootstrap().catch(() => {}), 0), true));
  $('#archiveForm').addEventListener('submit', () => setTimeout(() => syncUserRecords().catch(error => notify(error.message, true)), 0));
  $('#importFile').addEventListener('change', () => setTimeout(() => syncUserRecords().catch(error => notify(error.message, true)), 300));
  $('#appDialogForm').addEventListener('submit', () => setTimeout(async () => {
    const appState = state(); if (!appState) return;
    const candidate = appState.savedPlans.find(item => !knownPlanIds.has(item.id));
    if (!candidate) return;
    try { const remote = await api('/api/plans', { method: 'POST', body: JSON.stringify({ plan: candidate }) }); candidate.id = remote.id; knownPlanIds.add(remote.id); notify('方案已安全保存。'); }
    catch (error) { notify(error.message, true); }
  }, 0));
  const syncPlans = () => setTimeout(() => {
    const appState = state(); if (!appState) return;
    const stillSaved = new Set(appState.savedPlans.map(item => item.id));
    [...knownPlanIds].filter(id => !stillSaved.has(id)).forEach(id => api(`/api/plans/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {}));
    knownPlanIds = stillSaved;
  }, 0);
  window.addEventListener('topbox:records-changed', () => syncUserRecords().catch(error => notify(error.message, true)));
  window.addEventListener('topbox:plans-changed', syncPlans);
}

async function start() {
  for (let attempt = 0; attempt < 50 && !window.TopBoxApp; attempt += 1) await new Promise(resolve => setTimeout(resolve, 50));
  bindEvents();
  try { await loadBootstrap(); $('#authGate').classList.add('is-hidden'); }
  catch { $('#authGate').classList.add('is-visible'); }
  bindSelectionTooltips();
  setInterval(bindSelectionTooltips, 700);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadBootstrap().catch(() => {}); });
}

start();

