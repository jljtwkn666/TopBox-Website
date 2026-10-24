const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
// app.js contains a few legacy UI callbacks that are evaluated from a different
// module scope. Keep a global translation fallback available while the page is
// being hydrated after sign-in so those callbacks cannot interrupt login.
globalThis.t ??= text => String(text ?? '');
let user = null;
let knownPlanIds = new Set();
let pendingAvatar = '';
// These selections belong to the stable management views below.  Keeping them
// here avoids the old card renderers in app.js reusing stale selection state.
const stableArchiveSelection = new Set();
const stablePlanSelection = new Set();
let accountConfirmResolver = null;

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
const canDesignPalletKits = () => isAdmin() || Boolean(user?.permissions?.palletKits);

const state = () => window.TopBoxApp?.state;
const waitForApp = async () => {
  if (state()) return;
  await new Promise(resolve => {
    window.addEventListener('topbox-app-ready', resolve, { once: true });
    window.setTimeout(resolve, 8000);
  });
  if (!state()) throw new Error('页面初始化失败，请刷新后重试。');
};
const rerender = () => {
  window.TopBoxApp?.renderSelectors?.();
  renderStableArchives();
  renderStablePlans();
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
  $('#archives').classList.toggle('pallet-kit-readonly', !canDesignPalletKits());
  document.documentElement.dataset.palletKitAllowed = canDesignPalletKits() ? 'true' : 'false';
  window.dispatchEvent(new CustomEvent('topbox:permissions-changed', { detail: { palletKits: canDesignPalletKits() } }));
  const updatesButton = $('.nav-link[data-page="updates"]');
  updatesButton?.classList.toggle('permission-hidden', !canViewUpdates());
  $('#updates').classList.toggle('permission-hidden', !canViewUpdates());
  if (!canViewUpdates() && updatesButton?.classList.contains('active')) $('.nav-link[data-page="workspace"]')?.click();
}

async function loadBootstrap() {
  await waitForApp();
  const data = await api('/api/bootstrap');
  const appState = applyUserRecords(data);
  appState.savedPlans = Array.isArray(data.plans) ? data.plans : [];
  knownPlanIds = new Set(appState.savedPlans.map(item => item.id));
  applyUser(data.user);
  requestAnimationFrame(() => { rerender(); requestAnimationFrame(rerender); });
}

async function refreshUserRecords() {
  if (!user) return;
  await waitForApp();
  const data = await api('/api/shared/records');
  applyUserRecords(data);
  rerender();
}

async function syncUserRecords() {
  if (!state() || !canEditRecords()) return;
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
      const appState = state(); if (!appState) return '';
      const records = badge.id === 'selectedContainerCount' ? appState.containers : appState.cargo;
      const ids = badge.id === 'selectedContainerCount' ? appState.selectedContainers : appState.selectedCargo;
      const names = records.filter(item => ids.has(item.id)).map(item => item.name);
      return names.join('、');
    };
    const show = event => {
      const rect = badge.getBoundingClientRect(), x = event?.clientX || rect.left + rect.width / 2, y = event?.clientY || rect.bottom;
      const text = selectionText();
      if (!text) { tooltip.classList.remove('visible'); return; }
      tooltip.textContent = text;
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

function bindUtilizationPrecision() {
  const target = $('#utilizationPercent'); if (!target || target.dataset.precisionBound) return;
  target.dataset.precisionBound = 'true';
  const format = () => { const value = Number.parseFloat(target.textContent); const next = Number.isFinite(value) ? `${value.toFixed(2)}%` : '0.00%'; if (target.textContent !== next) target.textContent = next; };
  new MutationObserver(format).observe(target, { childList: true, characterData: true, subtree: true });
  format();
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
      const permissionControls = editablePermissions ? `<div class="permission-switches"><label><input data-user-permission="${escapeHtml(account.id)}" data-permission="records" type="checkbox" ${account.permissions?.records ? 'checked' : ''}> 档案维护</label><label><input data-user-permission="${escapeHtml(account.id)}" data-permission="palletKits" type="checkbox" ${account.permissions?.palletKits ? 'checked' : ''}> 托盘套装设计</label><label><input data-user-permission="${escapeHtml(account.id)}" data-permission="updates" type="checkbox" ${account.permissions?.updates ? 'checked' : ''}> 更新日志</label></div>` : '';
      const roleControl = user.role === 'super_admin' && account.role !== 'super_admin' ? `<select data-user-role="${escapeHtml(account.id)}"><option value="user" ${account.role === 'user' ? 'selected' : ''}>普通用户</option><option value="admin" ${account.role === 'admin' ? 'selected' : ''}>管理员</option></select>` : '';
      const profileControls = editableProfile ? `<div class="user-edit-fields"><input data-user-username="${escapeHtml(account.id)}" value="${escapeHtml(account.username)}" aria-label="用户名"><input data-user-nickname="${escapeHtml(account.id)}" value="${escapeHtml(account.nickname || '')}" aria-label="昵称"><input data-user-password="${escapeHtml(account.id)}" type="password" placeholder="新密码（留空不修改）" aria-label="新密码"></div>` : '';
      const saveControl = editableProfile ? `<button type="button" class="button secondary" data-save-user="${escapeHtml(account.id)}">保存用户</button>` : '';
      const deletable = account.role !== 'super_admin' && (user.role === 'super_admin' || account.role === 'user');
      const deleteControl = deletable ? `<button type="button" class="text-button delete-user" data-delete-user="${escapeHtml(account.id)}">删除用户</button>` : '';
      return `<div class="admin-user-row"><div><b>${escapeHtml(account.nickname || account.username)}</b><span> · ${escapeHtml(account.username)} · ${escapeHtml(account.role)}</span>${profileControls}${permissionControls}</div><div class="user-row-actions">${roleControl}${saveControl}${deleteControl}</div></div>`;
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

function askAccountConfirm(message, title = '确认删除') {
  const dialog = $('#appDialog');
  if (!dialog) return Promise.resolve(false);
  if (dialog.open) dialog.close();
  $('#appDialogEyebrow').textContent = 'TOP BOX';
  $('#appDialogTitle').textContent = title;
  $('#appDialogMessage').textContent = message;
  $('#appDialogInputWrap').classList.add('hidden');
  $('#pdfPreview').classList.add('hidden');
  $('#pdfDownload').classList.add('hidden');
  $('#pdfPrint').classList.add('hidden');
  $('#appDialogCancel').classList.remove('hidden');
  $('#appDialogConfirm').classList.remove('hidden');
  $('#appDialogConfirm').textContent = '确定';
  return new Promise(resolve => { accountConfirmResolver = resolve; dialog.showModal(); });
}

function settleAccountConfirm(answer) {
  const resolve = accountConfirmResolver; accountConfirmResolver = null;
  if (resolve) resolve(answer);
}

function updateStableBulkButtons() {
  const archive = $('#bulkDeleteArchive'), plans = $('#bulkDeletePlans');
  if (archive) { archive.disabled = !stableArchiveSelection.size; archive.textContent = stableArchiveSelection.size ? `批量删除 (${stableArchiveSelection.size})` : '批量删除'; }
  if (plans) { plans.disabled = !stablePlanSelection.size; plans.textContent = stablePlanSelection.size ? `批量删除 (${stablePlanSelection.size})` : '批量删除'; }
}

// Management pages used to be rendered by several historical implementations
// in app.js.  These two renderers deliberately own the complete table markup,
// so a head/body column mismatch or an old card renderer cannot return on a
// refresh.
function stablePage(items, pageKey, sizeKey) {
  const appState = state();
  appState.ui ??= {};
  const allowed = [20, 30, 50, 100, 200, 500, 1000, 2000];
  const size = allowed.includes(+appState.ui[sizeKey]) ? +appState.ui[sizeKey] : 50;
  const pages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(Math.max(1, +appState.ui[pageKey] || 1), pages);
  appState.ui[sizeKey] = size; appState.ui[pageKey] = page;
  return { page, size, pages, rows: items.slice((page - 1) * size, page * size) };
}

function renderStablePager(hostId, pageData, total, pageKey, sizeKey, render) {
  const host = $("#" + hostId); if (!host) return;
  const first = total ? (pageData.page - 1) * pageData.size + 1 : 0;
  const last = Math.min(total, pageData.page * pageData.size);
  host.innerHTML = `<span>${first}-${last}/${total}</span><span class="stable-pager-controls"><button type="button" data-stable-page="prev" ${pageData.page <= 1 ? 'disabled' : ''}>‹</button><button type="button" data-stable-page="next" ${pageData.page >= pageData.pages ? 'disabled' : ''}>›</button><select data-stable-size>${[20, 30, 50, 100, 200, 500, 1000, 2000].map(size => `<option value="${size}" ${size === pageData.size ? 'selected' : ''}>${size}</option>`).join('')}</select></span>`;
  host.querySelector('[data-stable-page="prev"]')?.addEventListener('click', () => { state().ui[pageKey] -= 1; render(); });
  host.querySelector('[data-stable-page="next"]')?.addEventListener('click', () => { state().ui[pageKey] += 1; render(); });
  host.querySelector('[data-stable-size]')?.addEventListener('change', event => { state().ui[sizeKey] = +event.target.value; state().ui[pageKey] = 1; render(); });
}

function archiveVolume(record, isContainer) {
  const value = (+record.l || 0) * (+record.w || 0) * (+record.h || 0) / 1e9;
  return `${value.toFixed(4)} m³`;
}

function openStableArchiveEditor(record) {
  if (!record) return;
  if (!canEditRecords()) { notify('未获档案维护权限。', true); return; }
  ensureCargoDetailFields();
  const dialog = $('#archiveDialog');
  const isContainer = state().archive === 'containers';
  $('#recordKind').value = state().archive;
  $('#recordId').value = record.id;
  $('#modalTitle').textContent = isContainer ? '修改容器' : '修改货物';
  $('#modalEyebrow').textContent = 'EDIT RECORD';
  const map = { recordName: 'name', recordType: 'type', recordShape: 'shape', recordL: 'l', recordW: 'w', recordH: 'h', recordWeight: 'weight', recordPieces: 'pieces', recordReserve: 'reserve', recordPrice: 'price', recordColor: 'color', recordPieceL: 'pieceL', recordPieceW: 'pieceW', recordPieceH: 'pieceH', recordNote: 'note' };
  Object.entries(map).forEach(([input, key]) => { const field = $('#' + input); if (field) field.value = record[key] ?? ''; });
  syncArchiveDialogFields(isContainer ? 'containers' : 'cargo', record);
  dialog?.showModal();
}

function ensureCargoDetailFields() {
  const pieces = $('#recordPiecesField');
  if (!pieces || $('#recordPieceDimensions')) return;
  pieces.insertAdjacentHTML('afterend', '<div id="recordPieceDimensions" class="cargo-extra-record-fields"><label>小件长 (mm)<input id="recordPieceL" type="number" min="0" step="0.1" value="0"></label><label>小件宽 (mm)<input id="recordPieceW" type="number" min="0" step="0.1" value="0"></label><label>小件高 (mm)<input id="recordPieceH" type="number" min="0" step="0.1" value="0"></label></div><label id="recordNoteField" class="cargo-note-field">备注<textarea id="recordNote" rows="2" maxlength="300" placeholder="可填写货物说明、堆码要求等"></textarea></label>');
}

function syncArchiveDialogFields(kind, record = null) {
  ensureCargoDetailFields();
  const cargo = kind === 'cargo';
  $('#recordPiecesField')?.toggleAttribute('hidden', !cargo);
  $('#recordPieceDimensions')?.toggleAttribute('hidden', !cargo);
  $('#recordNoteField')?.toggleAttribute('hidden', !cargo);
  $('#recordReserveField')?.toggleAttribute('hidden', cargo);
  if (cargo) {
    $('#recordPieceL').value = record?.pieceL ?? 0;
    $('#recordPieceW').value = record?.pieceW ?? 0;
    $('#recordPieceH').value = record?.pieceH ?? 0;
    $('#recordNote').value = record?.note ?? '';
  }
}

function openStableArchiveCreator() {
  if (!canEditRecords()) { notify('未获档案维护权限。', true); return; }
  const kind = state()?.archive === 'cargo' ? 'cargo' : 'containers';
  const form = $('#archiveForm');
  form?.reset();
  ensureCargoDetailFields();
  $('#recordKind').value = kind;
  $('#recordId').value = '';
  $('#modalTitle').textContent = kind === 'cargo' ? '新增货物' : '新增容器';
  $('#modalEyebrow').textContent = 'NEW RECORD';
  $('#recordPieces').value = '1';
  $('#recordReserve').value = '0';
  $('#recordWeight').value = '0';
  $('#recordPrice').value = '0';
  $('#recordColor').value = '#2563eb';
  syncArchiveDialogFields(kind);
  $('#archiveDialog')?.showModal();
}

const tableColumnDefinitions = {
  containers: [
    ['select', '选择'], ['seq', '序号'], ['name', '名称'], ['type', '类型'], ['size', '尺寸'],
    ['volume', '容积'], ['weight', '重量'], ['color', '颜色'], ['actions', '操作']
  ],
  cargo: [
    ['select', '选择'], ['seq', '序号'], ['name', '名称'], ['type', '类型'], ['size', '尺寸'],
    ['volume', '容积'], ['weight', '重量'], ['pieces', '小件数'], ['pieceSize', '小件尺寸'],
    ['note', '备注'], ['color', '颜色'], ['actions', '操作']
  ],
  plans: [
    ['select', '选择'], ['seq', '序号'], ['name', '方案名称'], ['createdAt', '保存时间'],
    ['containers', '容器数量'], ['quantity', '装载数量'], ['actions', '操作']
  ]
};

let activeColumnTable = null;
const tableColumnPrefs = kind => {
  try { return JSON.parse(localStorage.getItem(`topbox.table-columns.${kind}`)) || {}; }
  catch { return {}; }
};
const saveTableColumnPrefs = (kind, prefs) => localStorage.setItem(`topbox.table-columns.${kind}`, JSON.stringify(prefs));

function ensureTableColumnDialog() {
  if ($('#tableColumnDialog')) return;
  document.body.insertAdjacentHTML('beforeend', `<dialog id="tableColumnDialog" class="table-column-dialog"><form method="dialog"><div class="modal-head"><div><p class="eyebrow">TABLE COLUMNS</p><h2>表格列设置</h2></div><button type="button" class="icon-button" id="closeTableColumns">×</button></div><p>可显示或隐藏字段，并把常用字段固定在左侧。选择、序号始终固定在左侧，操作始终固定在右侧。</p><div id="tableColumnOptions" class="table-column-options"></div><div class="modal-actions"><button type="button" class="button secondary" id="resetTableColumns">恢复默认</button><button type="submit" class="button primary">完成</button></div></form></dialog>`);
  $('#closeTableColumns').onclick = () => $('#tableColumnDialog').close();
  $('#resetTableColumns').onclick = () => {
    if (!activeColumnTable) return;
    localStorage.removeItem(`topbox.table-columns.${activeColumnTable}`);
    $('#tableColumnDialog').close();
    activeColumnTable === 'plans' ? renderStablePlans() : renderStableArchives();
  };
}

function openTableColumnDialog(kind) {
  ensureTableColumnDialog();
  activeColumnTable = kind;
  const prefs = tableColumnPrefs(kind), hidden = new Set(prefs.hidden || []), pinned = new Set(prefs.pinned || []);
  $('#tableColumnOptions').innerHTML = tableColumnDefinitions[kind].map(([key, label]) => {
    const lockedLeft = key === 'select' || key === 'seq', lockedRight = key === 'actions';
    return `<div class="table-column-option"><b>${escapeHtml(label)}</b><label><input type="checkbox" data-column-visible="${key}" ${hidden.has(key) ? '' : 'checked'} ${lockedLeft || lockedRight ? 'disabled' : ''}> 显示</label><label><input type="checkbox" data-column-pinned="${key}" ${lockedLeft || pinned.has(key) ? 'checked' : ''} ${lockedLeft || lockedRight ? 'disabled' : ''}> 固定左侧</label></div>`;
  }).join('');
  $('#tableColumnOptions').onchange = event => {
    const visible = event.target.dataset.columnVisible, pin = event.target.dataset.columnPinned;
    const current = tableColumnPrefs(kind), currentHidden = new Set(current.hidden || []), currentPinned = new Set(current.pinned || []);
    if (visible) event.target.checked ? currentHidden.delete(visible) : currentHidden.add(visible);
    if (pin) event.target.checked ? currentPinned.add(pin) : currentPinned.delete(pin);
    current.hidden = [...currentHidden]; current.pinned = [...currentPinned]; saveTableColumnPrefs(kind, current);
    kind === 'plans' ? renderStablePlans() : renderStableArchives();
  };
  $('#tableColumnDialog').showModal();
}

function injectTableColumnButton(kind) {
  const host = kind === 'plans' ? $('#savedPlans .heading-actions') : $('#archives .heading-actions');
  if (!host) return;
  host.querySelector('[data-open-table-columns]')?.remove();
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'button secondary table-columns-button';
  button.dataset.openTableColumns = kind; button.textContent = '列设置';
  button.addEventListener('click', () => openTableColumnDialog(kind));
  host.prepend(button);
}

function configureStableTable(table, kind) {
  if (!table) return;
  table.querySelectorAll('.column-resize-handle').forEach(handle => handle.remove());
  const definitions = tableColumnDefinitions[kind], prefs = tableColumnPrefs(kind);
  const hidden = new Set(prefs.hidden || []), pinned = new Set(['select', 'seq', ...(prefs.pinned || [])]);
  table.classList.add('stable-column-managed'); table.dataset.columnTable = kind;
  const rows = [...table.rows];
  definitions.forEach(([key], index) => rows.forEach(row => {
    const cell = row.cells[index]; if (!cell) return;
    cell.dataset.columnKey = key;
    cell.toggleAttribute('hidden', hidden.has(key) && !['select', 'seq', 'actions'].includes(key));
    const width = prefs.widths?.[key];
    if (width) { cell.style.setProperty('width', `${width}px`, 'important'); cell.style.setProperty('min-width', `${width}px`, 'important'); cell.style.setProperty('max-width', `${width}px`, 'important'); }
  }));
  let left = 0;
  definitions.forEach(([key], index) => {
    const visible = !hidden.has(key) || ['select', 'seq', 'actions'].includes(key);
    if (!visible || !pinned.has(key)) return;
    const sample = rows.find(row => row.cells[index])?.cells[index];
    const width = prefs.widths?.[key] || sample?.getBoundingClientRect().width || (key === 'select' ? 54 : key === 'seq' ? 70 : 160);
    rows.forEach(row => { const cell = row.cells[index]; if (cell) { cell.classList.add('stable-sticky-left'); cell.style.setProperty('--sticky-left', `${left}px`); } });
    left += width;
  });
  const actionIndex = definitions.findIndex(([key]) => key === 'actions');
  rows.forEach(row => row.cells[actionIndex]?.classList.add('stable-sticky-right'));
  const header = table.tHead?.rows?.[0];
  definitions.forEach(([key], index) => {
    const th = header?.cells[index]; if (!th || key === 'actions') return;
    const handle = document.createElement('span'); handle.className = 'column-resize-handle'; handle.title = '拖动调整列宽';
    handle.addEventListener('pointerdown', event => {
      event.preventDefault(); event.stopPropagation();
      const startX = event.clientX, startWidth = th.getBoundingClientRect().width;
      const move = moveEvent => {
        const width = Math.max(54, Math.round(startWidth + moveEvent.clientX - startX));
        const current = tableColumnPrefs(kind); current.widths = { ...(current.widths || {}), [key]: width }; saveTableColumnPrefs(kind, current);
        rows.forEach(row => { const cell = row.cells[index]; if (cell) { cell.style.setProperty('width', `${width}px`, 'important'); cell.style.setProperty('min-width', `${width}px`, 'important'); cell.style.setProperty('max-width', `${width}px`, 'important'); } });
      };
      const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); configureStableTable(table, kind); };
      document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
    });
    th.append(handle);
  });
  injectTableColumnButton(kind);
}

function renderStableArchives() {
  const appState = state(), rowsNode = $('#archiveRows');
  if (!appState || !rowsNode) return;
  const isContainer = appState.archive === 'containers';
  const records = Array.isArray(appState[appState.archive]) ? appState[appState.archive] : [];
  const query = ($('#archiveSearch')?.value || '').trim().toLowerCase();
  const filtered = records.filter(record => !query || `${record.name || ''}${record.type || ''}`.toLowerCase().includes(query));
  const pageData = stablePage(filtered, 'archivePage', 'archiveSize');
  const table = rowsNode.closest('table');
  if (!table) return;
  table.className = `stable-data-table stable-archive-table ${isContainer ? 'is-container' : 'is-cargo'}`;
  const columns = isContainer ? 9 : 12;
  const allSelected = filtered.length > 0 && filtered.every(record => stableArchiveSelection.has(record.id));
  const someSelected = filtered.some(record => stableArchiveSelection.has(record.id));
  table.innerHTML = `<thead><tr id="archiveTableHead"><th><input id="stableSelectAllArchive" type="checkbox" aria-label="选择全部"></th><th>序号</th><th>名称</th><th>类型</th><th>尺寸（长 × 宽 × 高）</th><th>容积</th><th>重量</th>${isContainer ? '' : '<th>小件数</th><th>小件尺寸</th><th>备注</th>'}<th>颜色</th><th>操作</th></tr></thead><tbody id="archiveRows">${pageData.rows.map((record, index) => `<tr><td><input data-stable-archive-select="${escapeHtml(record.id)}" type="checkbox" ${stableArchiveSelection.has(record.id) ? 'checked' : ''} aria-label="选择 ${escapeHtml(record.name)}"></td><td>${(pageData.page - 1) * pageData.size + index + 1}</td><td><b>${escapeHtml(record.name)}</b></td><td><span class="type-pill">${escapeHtml(record.type)}</span></td><td>${record.l} × ${record.w} × ${record.h} mm</td><td>${archiveVolume(record, isContainer)}</td><td>${+record.weight || 0} kg</td>${isContainer ? '' : `<td>${+record.pieces || 1} 件</td><td>${record.pieceL || record.pieceW || record.pieceH ? `${+record.pieceL || 0} × ${+record.pieceW || 0} × ${+record.pieceH || 0} mm` : '—'}</td><td class="archive-note-cell" title="${escapeHtml(record.note || '')}">${escapeHtml(record.note || '—')}</td>`}<td><i class="color-pill" style="background:${escapeHtml(record.color || '#2563eb')}"></i></td><td><span class="row-actions">${record.kit && canDesignPalletKits() ? `<button type="button" data-pallet-kit-edit="${escapeHtml(record.id)}">设计</button>` : ''}<button type="button" data-stable-edit-archive="${escapeHtml(record.id)}">编辑</button><button type="button" class="delete" data-stable-delete-archive="${escapeHtml(record.id)}">删除</button></span></td></tr>`).join('') || `<tr><td colspan="${columns}"><div class="empty-state">没有匹配的档案</div></td></tr>`}</tbody>`;
  const selectAll = $('#stableSelectAllArchive');
  if (selectAll) { selectAll.checked = allSelected; selectAll.indeterminate = someSelected && !allSelected; selectAll.addEventListener('change', event => { filtered.forEach(record => event.target.checked ? stableArchiveSelection.add(record.id) : stableArchiveSelection.delete(record.id)); renderStableArchives(); }); }
  $$('[data-stable-archive-select]').forEach(input => input.addEventListener('change', () => { input.checked ? stableArchiveSelection.add(input.dataset.stableArchiveSelect) : stableArchiveSelection.delete(input.dataset.stableArchiveSelect); renderStableArchives(); }));
  $$('[data-stable-edit-archive]').forEach(button => button.addEventListener('click', () => openStableArchiveEditor(records.find(record => record.id === button.dataset.stableEditArchive))));
  $$('[data-pallet-kit-edit]').forEach(button => button.addEventListener('click', () => { const record = records.find(item => item.id === button.dataset.palletKitEdit); if (record) window.dispatchEvent(new CustomEvent('topbox:edit-pallet-kit', { detail: record })); }));
  $$('[data-stable-delete-archive]').forEach(button => button.addEventListener('click', () => deleteArchivesDirect([button.dataset.stableDeleteArchive], button)));
  $('#containerTotal').textContent = appState.containers.length; $('#cargoTotal').textContent = appState.cargo.length;
  $('#archiveCount').textContent = `共 ${filtered.length} 条记录`;
  renderStablePager('archivePager', pageData, filtered.length, 'archivePage', 'archiveSize', renderStableArchives);
  updateStableBulkButtons();
  configureStableTable(table, isContainer ? 'containers' : 'cargo');
}

async function deleteArchivesDirect(ids) {
  if (!canEditRecords()) { notify('未获档案维护权限。', true); return; }
  if (!ids.length) return;
  if (!await askAccountConfirm(`确定删除已选择的 ${ids.length} 条档案吗？`)) return;
  const appState = state(), remove = new Set(ids);
  appState[appState.archive] = appState[appState.archive].filter(record => !remove.has(record.id));
  ids.forEach(id => { stableArchiveSelection.delete(id); appState.selectedContainers.delete(id); appState.selectedCargo.delete(id); });
  try { await api('/api/shared/records', { method: 'PUT', body: JSON.stringify({ containers: appState.containers, cargo: appState.cargo }) }); await refreshUserRecords(); notify('档案已删除。'); }
  catch (error) { notify(error.message, true); await refreshUserRecords(); }
}

function renderStablePlans() {
  const appState = state(), host = $('#savedPlansList');
  if (!appState || !host) return;
  const plans = Array.isArray(appState.savedPlans) ? appState.savedPlans : [];
  const pageData = stablePage(plans, 'savedPlansPage', 'savedPlansSize');
  const allSelected = pageData.rows.length > 0 && pageData.rows.every(plan => stablePlanSelection.has(plan.id));
  const someSelected = pageData.rows.some(plan => stablePlanSelection.has(plan.id));
  const rows = pageData.rows.map((plan, index) => {
    const planItems = Array.isArray(plan.plans) ? plan.plans : [];
    const packages = planItems.reduce((sum, item) => sum + (Array.isArray(item.positions) ? item.positions.length : 0), 0);
    const pieces = planItems.reduce((sum, item) => sum + (Array.isArray(item.positions) ? item.positions.reduce((count, position) => count + (+position.pieces || 0), 0) : 0), 0);
    return `<tr><td><input data-stable-plan-select="${escapeHtml(plan.id)}" type="checkbox" ${stablePlanSelection.has(plan.id) ? 'checked' : ''} aria-label="选择 ${escapeHtml(plan.name)}"></td><td>${(pageData.page - 1) * pageData.size + index + 1}</td><td><b>${escapeHtml(plan.name)}</b></td><td>${escapeHtml(plan.createdAt || '')}</td><td>${planItems.length} 个容器方案</td><td>${packages} 包 / ${pieces.toLocaleString()} 件</td><td><span class="row-actions"><button type="button" data-stable-open-plan="${escapeHtml(plan.id)}">打开方案</button><button type="button" class="delete" data-stable-delete-plan="${escapeHtml(plan.id)}">删除</button></span></td></tr>`;
  }).join('');
  host.innerHTML = rows ? `<div class="stable-list-table-wrap"><table class="stable-data-table stable-plan-table"><thead><tr><th><input id="stableSelectAllPlans" type="checkbox" aria-label="选择全部"></th><th>序号</th><th>方案名称</th><th>保存时间</th><th>容器数量</th><th>装载数量</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty-state">还没有保存的装载方案。</div>';
  const selectAll = $('#stableSelectAllPlans');
  if (selectAll) { selectAll.checked = allSelected; selectAll.indeterminate = someSelected && !allSelected; selectAll.addEventListener('change', event => { pageData.rows.forEach(plan => event.target.checked ? stablePlanSelection.add(plan.id) : stablePlanSelection.delete(plan.id)); renderStablePlans(); }); }
  $$('[data-stable-plan-select]').forEach(input => input.addEventListener('change', () => { input.checked ? stablePlanSelection.add(input.dataset.stablePlanSelect) : stablePlanSelection.delete(input.dataset.stablePlanSelect); renderStablePlans(); }));
  $$('[data-stable-open-plan]').forEach(button => button.addEventListener('click', () => window.TopBoxApp?.openSavedPlan?.(button.dataset.stableOpenPlan)));
  $$('[data-stable-delete-plan]').forEach(button => button.addEventListener('click', () => deletePlansDirect([button.dataset.stableDeletePlan], button)));
  renderStablePager('savedPlansPager', pageData, plans.length, 'savedPlansPage', 'savedPlansSize', renderStablePlans);
  updateStableBulkButtons();
  configureStableTable(host.querySelector('table'), 'plans');
}

async function deletePlansDirect(ids) {
  if (!ids.length) return;
  if (!await askAccountConfirm(`确定删除已选择的 ${ids.length} 个装载方案吗？`)) return;
  try {
    await Promise.all(ids.map(id => api(`/api/plans/${encodeURIComponent(id)}`, { method: 'DELETE' })));
    const remove = new Set(ids); state().savedPlans = state().savedPlans.filter(plan => !remove.has(plan.id)); ids.forEach(id => { stablePlanSelection.delete(id); knownPlanIds.delete(id); });
    renderStablePlans(); notify('装载方案已删除。');
  } catch (error) { notify(error.message, true); await loadBootstrap(); }
}

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
  const preset = $('#shareExpiryPreset').value;
  const customHours = (+$('#shareCustomValue').value || 0) * ($('#shareCustomUnit').value === 'day' ? 24 : 1);
  const expiresInHours = preset === 'custom' ? customHours : +preset;
  if (!Number.isFinite(expiresInHours) || expiresInHours < 1 || expiresInHours > 8760) throw new Error('自定义有效时长需为 1–8760 小时。');
  $('#shareConfirm').disabled = true;
  $('#shareMessage').textContent = '正在随机生成可用分享码…';
  try {
    const result = await api('/api/shares', { method: 'POST', body: JSON.stringify({ kind: shareAction.kind, payload, expiresInHours }) });
    input.value = result.code; input.readOnly = true;
    $('#shareMessage').textContent = `分享码已生成：${result.code}\n有效至 ${new Date(result.expiresAt).toLocaleString('zh-CN')}。`;
  } finally { $('#shareConfirm').disabled = false; }
}
function openShareDialog(mode, kind) {
  if (mode === 'import' && kind === 'archives' && !canEditRecords()) { notify('未获档案维护权限，不能导入档案分享码。', true); return; }
  const dialog = $('#shareDialog'), input = $('#shareCodeInput');
  shareAction = { mode, kind };
  $('#shareTitle').textContent = mode === 'create' ? '生成数据分享码' : '导入数据分享码';
  $('#shareMessage').textContent = mode === 'create' ? '正在自动生成有效期 30 天的分享码。' : '输入或粘贴其他用户提供的分享码。导入前会显示数据类别和数量。';
  input.value = ''; input.readOnly = mode === 'create';
  const appendMode = $('input[name="shareImportMode"][value="append"]'); if (appendMode) appendMode.checked = true;
  $('#shareImportMode').classList.add('hidden');
  $('#shareExpiryOptions').classList.toggle('hidden', mode !== 'create');
  $('#shareCustomExpiry').classList.add('hidden');
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
    if ((preview.kind === 'containers' || preview.kind === 'cargo') && !canEditRecords()) throw new Error('未获档案维护权限，不能导入档案分享码。');
    shareAction = { mode: 'confirm', code, kind: preview.kind };
    $('#shareMessage').textContent = `即将导入 ${preview.count} 条${preview.kind === 'plans' ? '装车方案' : preview.kind === 'containers' ? '容器档案' : '货物档案'}。确认后将加入当前账号的数据。`;
    input.readOnly = true; $('#shareImportMode').classList.remove('hidden'); $('#shareConfirm').textContent = '确认导入'; return;
  }
  if ((shareAction.kind === 'containers' || shareAction.kind === 'cargo') && !canEditRecords()) throw new Error('未获档案维护权限，不能导入档案分享码。');
  const importMode = $('input[name="shareImportMode"]:checked')?.value || 'append';
  const result = await api(`/api/shares/${encodeURIComponent(shareAction.code)}/import`, { method: 'POST', body: JSON.stringify({ mode: importMode }) });
  $('#shareDialog').close(); await loadBootstrap(); notify(`已导入 ${result.count} 条数据。`);
}

function bindEvents() {
  ensureCargoDetailFields();
  document.addEventListener('click', event => {
    const button = event.target.closest('#addArchive');
    if (!button) return;
    event.preventDefault(); event.stopImmediatePropagation();
    openStableArchiveCreator();
  }, true);
  $('#accountMenuButton').addEventListener('click', openAccountPage);
  $('#shareClose').addEventListener('click', () => $('#shareDialog').close());
  $('#shareCancel').addEventListener('click', () => $('#shareDialog').close());
  $('#shareCopy').addEventListener('click', async () => { const code = $('#shareCodeInput').value; if (!code) return; try { await navigator.clipboard.writeText(code); notify('分享码已复制。'); } catch { $('#shareCodeInput').select(); document.execCommand('copy'); notify('分享码已复制。'); } });
  $('#shareExpiryPreset').addEventListener('change', event => $('#shareCustomExpiry').classList.toggle('hidden', event.target.value !== 'custom'));
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
  const denyRecordEdit = event => {
    if (!user || canEditRecords()) return false;
    const action = event.target.closest('#archives [data-edit], #archives [data-delete], #archives [data-stable-edit-archive], #archives [data-stable-delete-archive], #addArchive, #bulkDeleteArchive, #importArchiveShare, .file-button, #importFile');
    if (!action) return false;
    event.preventDefault(); event.stopImmediatePropagation();
    notify('未获档案维护权限。', true);
    return true;
  };
  document.addEventListener('click', denyRecordEdit, true);
  document.addEventListener('change', event => {
    if (!user || canEditRecords() || !event.target.matches('#importFile')) return;
    event.preventDefault(); event.stopImmediatePropagation(); event.target.value = '';
    notify('未获档案维护权限。', true);
  }, true);
  document.addEventListener('submit', event => {
    if (!user || canEditRecords() || !event.target.matches('#archiveForm')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    notify('未获档案维护权限。', true);
  }, true);
  document.addEventListener('click', event => {
    if (!event.target.closest('.nav-link[data-page="archives"], [data-go-archives]')) return;
    stableArchiveSelection.clear();
    setTimeout(() => { renderStableArchives(); updateStableBulkButtons(); }, 0);
  }, true);
  $$('.nav-link').forEach(button => button.addEventListener('click', () => setTimeout(() => loadBootstrap().catch(() => {}), 0), true));
  $('#archiveForm').addEventListener('submit', () => setTimeout(() => syncUserRecords().catch(error => notify(error.message, true)), 0));
  $('#importFile').addEventListener('change', () => setTimeout(() => syncUserRecords().catch(error => notify(error.message, true)), 300));
  // Run after the legacy listeners have changed their state, then restore the
  // single table implementation.  This is intentionally delegated because
  // the tables are replaced as users search, page, or switch archive type.
  $('.archive-tabs')?.addEventListener('click', () => setTimeout(renderStableArchives, 0));
  $('#archiveSearch')?.addEventListener('input', () => { state().ui.archivePage = 1; setTimeout(renderStableArchives, 0); });
  document.addEventListener('click', event => {
    const bulkArchives = event.target.closest('#bulkDeleteArchive');
    const bulkPlans = event.target.closest('#bulkDeletePlans');
    if (!bulkArchives && !bulkPlans) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const selected = bulkArchives ? [...stableArchiveSelection] : [...stablePlanSelection];
    if (!selected.length) { notify(bulkArchives ? '请先选择要删除的档案。' : '请先选择要删除的方案。', true); return; }
    if (bulkArchives) deleteArchivesDirect(selected);
    else deletePlansDirect(selected);
  }, true);
  // The application-level dialog is reused for persistent deletion
  // confirmation. Capture these events so the older dialog callbacks cannot
  // close it without resolving the deletion promise.
  $('#appDialogForm').addEventListener('submit', event => {
    if (!accountConfirmResolver) return;
    event.preventDefault(); event.stopImmediatePropagation();
    settleAccountConfirm(true); $('#appDialog').close();
  }, true);
  ['#appDialogCancel', '#appDialogClose'].forEach(selector => $(selector)?.addEventListener('click', event => {
    if (!accountConfirmResolver) return;
    event.preventDefault(); event.stopImmediatePropagation();
    settleAccountConfirm(false); $('#appDialog').close();
  }, true));
  $('#appDialog').addEventListener('cancel', event => {
    if (!accountConfirmResolver) return;
    event.preventDefault(); event.stopImmediatePropagation();
    settleAccountConfirm(false); $('#appDialog').close();
  }, true);
  $('#appDialog').addEventListener('close', () => settleAccountConfirm(false));
  $('#appDialogForm').addEventListener('submit', () => setTimeout(async () => {
    const appState = state(); if (!appState) return;
    const candidate = appState.savedPlans.find(item => !knownPlanIds.has(item.id));
    if (!candidate) return;
    try { const remote = await api('/api/plans', { method: 'POST', body: JSON.stringify({ plan: candidate }) }); candidate.id = remote.id; knownPlanIds.add(remote.id); renderStablePlans(); notify('方案已安全保存。'); }
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
  ensureCargoDetailFields();
  bindArchiveNavigationV298();
  bindEvents();
  try { await loadBootstrap(); $('#authGate').classList.add('is-hidden'); }
  catch { $('#authGate').classList.add('is-visible'); }
  bindUtilizationPrecision();
  bindSelectionTooltips();
  setInterval(bindSelectionTooltips, 700);
  // Keep the current workspace stable when the browser regains focus.  Data is
  // refreshed through the existing menu actions instead of re-initialising the
  // page whenever the user switches applications.
}

/* v2.9.8: the two archive entries are independent destinations.  This handler
   owns their navigation before old generic "archives" listeners can turn them
   back into a combined archive page. */
function bindArchiveNavigationV298() {
  const labels = { containers: '容器档案', cargo: '货物档案' };
  const paint = kind => {
    const appState = state();
    if (!appState) return;
    const archive = kind === 'cargo' ? 'cargo' : 'containers';
    appState.archive = archive;
    stableArchiveSelection.clear();
    $$('.nav-link').forEach(item => item.classList.toggle('active', item.dataset.archiveTarget === archive));
    $$('.page').forEach(item => item.classList.toggle('active-page', item.id === 'archives'));
    $$('.archive-tabs button').forEach(tab => tab.classList.toggle('active', tab.dataset.archive === archive));
    const heading = $('#archives .page-heading h1');
    const description = $('#archives .page-heading p');
    if (heading) heading.textContent = labels[archive];
    if (description) description.textContent = '维护装载计算与 3D 可视化所需的基础数据。';
    renderStableArchives();
  };
  const pinLabels = () => $$('.nav-link[data-page="archives"][data-archive-target]').forEach(button => {
    const label = labels[button.dataset.archiveTarget] || labels.containers;
    if (button.textContent !== label) button.textContent = label;
  });
  pinLabels();
  const nav = document.querySelector('.topbar nav');
  if (nav) new MutationObserver(pinLabels).observe(nav, { childList: true, subtree: true, characterData: true });
  document.addEventListener('click', event => {
    const button = event.target.closest('.nav-link[data-page="archives"][data-archive-target]');
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const kind = button.dataset.archiveTarget === 'cargo' ? 'cargo' : 'containers';
    paint(kind);
    Promise.resolve(loadBootstrap()).catch(() => {}).finally(() => {
      paint(kind);
      requestAnimationFrame(() => paint(kind));
    });
  }, true);
}

start();

