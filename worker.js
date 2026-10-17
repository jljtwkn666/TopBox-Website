const SEED_CONTAINERS = [
  { id: 'c1', name: '9.6m 厢式货车', type: '车厢', shape: 'box', l: 9600, w: 2400, h: 2500, weight: 6800, pieces: 1, reserve: 5, price: 0, color: '#0f4c81' },
  { id: 'c2', name: '7.6m 厢式货车', type: '车厢', shape: 'box', l: 7600, w: 2300, h: 2300, weight: 5200, pieces: 1, reserve: 4, price: 0, color: '#2563eb' },
  { id: 'c3', name: '标准木箱', type: '箱子', shape: 'box', l: 1200, w: 1000, h: 900, weight: 35, pieces: 1, reserve: 2, price: 0, color: '#9a6b38' }
];
const SEED_CARGO = [
  { id: 'g1', name: 'A 型纸箱（20件/包）', type: '单体货物', shape: 'box', l: 600, w: 400, h: 350, weight: 12, pieces: 20, reserve: 0, price: 86, color: '#2563eb', quantity: 1 },
  { id: 'g2', name: 'B 型托盘货', type: '套装货物', shape: 'box', l: 1200, w: 1000, h: 1100, weight: 280, pieces: 600, reserve: 0, price: 920, color: '#f97316', quantity: 1 },
  { id: 'g3', name: '圆桶包装', type: '单体货物', shape: 'cylinder', l: 580, w: 580, h: 900, weight: 46, pieces: 1, reserve: 0, price: 330, color: '#10b981', quantity: 1 },
  { id: 'g4', name: 'C 型纸箱', type: '单体货物', shape: 'box', l: 500, w: 350, h: 300, weight: 8.5, pieces: 12, reserve: 0, price: 64, color: '#8b5cf6', quantity: 1 }
];

// Container and cargo records are stored separately.  Keep this validation at
// the API boundary so a stale browser cannot accidentally save one collection
// into the other (which previously made both archive tabs display cargo).
const CONTAINER_TYPES = new Set(['车厢', '箱子', '桶', '托盘']);
const CARGO_TYPES = new Set(['单体货物', '套装货物']);
const uniqueRecords = records => [...new Map(records.filter(item => item && typeof item === 'object' && item.id).map(item => [item.id, item])).values()];
const isContainerRecord = item => CONTAINER_TYPES.has(String(item?.type || ''));
const isCargoRecord = item => CARGO_TYPES.has(String(item?.type || ''));
const canonicalRecords = raw => {
  const hasContainers = Array.isArray(raw?.containers), hasCargo = Array.isArray(raw?.cargo);
  const containers = hasContainers ? raw.containers : [];
  const cargo = hasCargo ? raw.cargo : [];
  const contaminatedContainers = containers.some(item => !isContainerRecord(item));
  const contaminatedCargo = cargo.some(item => !isCargoRecord(item));
  const cleanContainers = uniqueRecords([...containers.filter(isContainerRecord), ...(contaminatedCargo ? cargo.filter(isContainerRecord) : [])]);
  const cleanCargo = uniqueRecords([...cargo.filter(isCargoRecord), ...(contaminatedContainers ? containers.filter(isCargoRecord) : [])]);
  return {
    // An intentionally empty archive remains empty.  Seed data is used only
    // for a missing collection or one that has been contaminated by the other type.
    containers: cleanContainers.length || (hasContainers && !contaminatedContainers) ? cleanContainers : SEED_CONTAINERS,
    cargo: cleanCargo.length || (hasCargo && !contaminatedCargo) ? cleanCargo : SEED_CARGO
  };
};
async function loadSharedRecords(env, repair = true) {
  const rows = await env.DB.prepare('SELECT record_key, payload FROM shared_records').all();
  const raw = Object.fromEntries((rows.results || []).map(row => {
    try { return [row.record_key, JSON.parse(row.payload)]; } catch { return [row.record_key, []]; }
  }));
  const records = canonicalRecords(raw);
  const changed = JSON.stringify(raw.containers || []) !== JSON.stringify(records.containers) || JSON.stringify(raw.cargo || []) !== JSON.stringify(records.cargo);
  if (repair && changed) await env.DB.batch(['containers', 'cargo'].map(key => env.DB.prepare('INSERT INTO shared_records (record_key, payload, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(record_key) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at, updated_by=excluded.updated_by').bind(key, JSON.stringify(records[key]), now(), 'system_repair')));
  return records;
}

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
const error = (message, status = 400) => json({ error: message }, status);
const now = () => new Date().toISOString();
const cookieValue = (request, name) => (request.headers.get('cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1);
const bytesToBase64 = bytes => btoa(String.fromCharCode(...bytes));
const base64ToBytes = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const randomId = () => crypto.randomUUID().replace(/-/g, '');

async function sha256(value) { return bytesToBase64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))); }
async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return bytesToBase64(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: base64ToBytes(salt), iterations: 100000 }, key, 256)));
}
async function newPassword(password) { const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16))); return { salt, hash: await passwordHash(password, salt) }; }

async function ensureSchema(env) {
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, role TEXT NOT NULL, nickname TEXT NOT NULL, avatar TEXT DEFAULT \'\', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS shared_records (record_key TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)')
  ]);
  // Existing deployments predate per-user feature permissions. The migration is
  // deliberately idempotent because every Worker isolate can initialize itself.
  await env.DB.prepare("ALTER TABLE users ADD COLUMN permissions TEXT NOT NULL DEFAULT '{\"records\":false,\"updates\":false}'").run().catch(() => {});
  const admin = await env.DB.prepare('SELECT id FROM users WHERE username = ?').bind('admin').first();
  if (!admin) {
    const password = await newPassword('12345');
    await env.DB.prepare('INSERT OR IGNORE INTO users (id, username, password_hash, password_salt, role, nickname, avatar, permissions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind('u_admin', 'admin', password.hash, password.salt, 'super_admin', '超级管理员', '', JSON.stringify({ records: true, updates: true }), now(), now()).run();
  }
  for (const [key, payload] of [['containers', SEED_CONTAINERS], ['cargo', SEED_CARGO]]) await env.DB.prepare('INSERT OR IGNORE INTO shared_records (record_key, payload, updated_at, updated_by) VALUES (?, ?, ?, ?)').bind(key, JSON.stringify(payload), now(), 'u_admin').run();
}

const defaultPermissions = role => ({ records: role === 'super_admin' || role === 'admin', updates: role === 'super_admin' || role === 'admin' });
const permissionsFor = row => { try { return { ...defaultPermissions(row?.role), ...(row?.permissions ? JSON.parse(row.permissions) : {}) }; } catch { return defaultPermissions(row?.role); } };
const publicUser = row => row && ({ id: row.id, username: row.username, role: row.role, nickname: row.nickname, avatar: row.avatar || '', permissions: permissionsFor(row) });
async function sessionUser(request, env) {
  const raw = cookieValue(request, 'topbox_session');
  if (!raw) return null;
  const row = await env.DB.prepare('SELECT u.id, u.username, u.role, u.nickname, u.avatar, u.permissions FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?').bind(await sha256(raw), now()).first();
  return publicUser(row);
}
const canManageUsers = user => user?.role === 'super_admin' || user?.role === 'admin';
const canEditRecords = user => canManageUsers(user) || Boolean(user?.permissions?.records);
const assertPassword = password => typeof password === 'string' && password.length >= 5 && password.length <= 128;
async function readBody(request) { try { return await request.json(); } catch { return null; } }

async function api(request, env, path) {
  await ensureSchema(env);
  if (path === '/api/auth/login' && request.method === 'POST') {
    const body = await readBody(request), username = String(body?.username || '').trim().toLowerCase(), password = String(body?.password || '');
    const account = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
    if (!account || !password || (await passwordHash(password, account.password_salt)) !== account.password_hash) return error('账号或密码不正确。', 401);
    const rawToken = bytesToBase64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, '');
    await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)').bind(await sha256(rawToken), account.id, new Date(Date.now() + 604800000).toISOString(), now()).run();
    return json({ user: publicUser(account) }, 200, { 'set-cookie': `topbox_session=${rawToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800` });
  }
  if (path === '/api/auth/logout' && request.method === 'POST') {
    const raw = cookieValue(request, 'topbox_session'); if (raw) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(raw)).run();
    return json({ ok: true }, 200, { 'set-cookie': 'topbox_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' });
  }
  const user = await sessionUser(request, env);
  if (!user) return error('请先登录。', 401);
  if (path === '/api/bootstrap' && request.method === 'GET') {
    const records = await loadSharedRecords(env);
    const plans = await env.DB.prepare('SELECT id, name, payload, created_at, updated_at FROM plans WHERE owner_id = ? ORDER BY updated_at DESC').bind(user.id).all();
    return json({ user, containers: records.containers, cargo: records.cargo, plans: (plans.results || []).map(row => ({ id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at, ...JSON.parse(row.payload) })) });
  }
  if (path === '/api/profile' && request.method === 'PATCH') {
    const body = await readBody(request), nickname = String(body?.nickname || '').trim().slice(0, 40), avatar = String(body?.avatar || '').trim().slice(0, 500000);
    if (!nickname) return error('昵称不能为空。');
    if (avatar && !/^(data:image\/(png|jpe?g|webp);base64,|https:\/\/)/i.test(avatar)) return error('头像格式无效。');
    await env.DB.prepare('UPDATE users SET nickname = ?, avatar = ?, updated_at = ? WHERE id = ?').bind(nickname, avatar, now(), user.id).run();
    return json({ user: { ...user, nickname, avatar } });
  }
  if (path === '/api/profile/password' && request.method === 'PATCH') {
    const body = await readBody(request), account = await env.DB.prepare('SELECT password_hash, password_salt FROM users WHERE id = ?').bind(user.id).first();
    if (!account || (await passwordHash(String(body?.oldPassword || ''), account.password_salt)) !== account.password_hash) return error('旧密码不正确。', 403);
    if (!assertPassword(body?.newPassword)) return error('新密码长度需为 5–128 位。');
    const password = await newPassword(body.newPassword); await env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?').bind(password.hash, password.salt, now(), user.id).run();
    return json({ ok: true });
  }
  if (path === '/api/shared/records') {
    if (request.method === 'GET') return json(await loadSharedRecords(env));
    if (request.method === 'PUT') {
      if (!canEditRecords(user)) return error('未获档案维护权限。', 403);
      const body = await readBody(request); if (!Array.isArray(body?.containers) || !Array.isArray(body?.cargo)) return error('共享档案格式无效。');
      if (body.containers.some(item => !isContainerRecord(item)) || body.cargo.some(item => !isCargoRecord(item))) return error('容器与货物档案类型不匹配，已拒绝保存以保护档案数据。');
      const records = { containers: uniqueRecords(body.containers), cargo: uniqueRecords(body.cargo) };
      await env.DB.batch(['containers', 'cargo'].map(key => env.DB.prepare('INSERT INTO shared_records (record_key, payload, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(record_key) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at, updated_by=excluded.updated_by').bind(key, JSON.stringify(records[key]), now(), user.id)));
      return json({ ok: true });
    }
  }
  if (path === '/api/plans' && request.method === 'POST') {
    const body = await readBody(request), plan = body?.plan, name = String(plan?.name || '').trim().slice(0, 120);
    if (!name || !Array.isArray(plan?.plans)) return error('方案数据无效。');
    const id = String(plan.id || randomId()).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || randomId(), payload = JSON.stringify({ mode: plan.mode || 'specified', plans: plan.plans });
    await env.DB.prepare('INSERT INTO plans (id, owner_id, name, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, payload=excluded.payload, updated_at=excluded.updated_at WHERE owner_id=excluded.owner_id').bind(id, user.id, name, payload, plan.createdAt || now(), now()).run();
    return json({ id, createdAt: plan.createdAt || now() });
  }
  if (path.startsWith('/api/plans/') && request.method === 'DELETE') { await env.DB.prepare('DELETE FROM plans WHERE id = ? AND owner_id = ?').bind(decodeURIComponent(path.slice(11)), user.id).run(); return json({ ok: true }); }
  if (path === '/api/admin/users') {
    if (!canManageUsers(user)) return error('无用户管理权限。', 403);
    if (request.method === 'GET') { const users = await env.DB.prepare('SELECT id, username, role, nickname, avatar, permissions, created_at, updated_at FROM users ORDER BY CASE role WHEN \'super_admin\' THEN 0 WHEN \'admin\' THEN 1 ELSE 2 END, created_at').all(); return json({ users: (users.results || []).map(publicUser) }); }
    if (request.method === 'POST') {
      const body = await readBody(request), username = String(body?.username || '').trim().toLowerCase(), role = body?.role === 'admin' ? 'admin' : 'user', nickname = String(body?.nickname || username).trim().slice(0, 40);
      if (!/^[a-z0-9_.-]{3,40}$/.test(username) || !assertPassword(body?.password) || !nickname) return error('账号需为 3–40 位小写字母、数字、._-，密码至少 5 位。');
      if (role === 'admin' && user.role !== 'super_admin') return error('只有超级管理员可创建管理员。', 403);
      if (role === 'admin' && +(await env.DB.prepare('SELECT COUNT(*) AS count FROM users WHERE role = ?').bind('admin').first()).count >= 5) return error('管理员数量最多为 5 个。');
      const password = await newPassword(body.password);
      try { await env.DB.prepare('INSERT INTO users (id, username, password_hash, password_salt, role, nickname, avatar, permissions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(`u_${randomId()}`, username, password.hash, password.salt, role, nickname, '', JSON.stringify(defaultPermissions(role)), now(), now()).run(); } catch { return error('该账号已存在。'); }
      return json({ ok: true });
    }
    if (request.method === 'PATCH') {
      const body = await readBody(request), id = String(body?.id || ''), target = await env.DB.prepare('SELECT id, username, nickname, role, permissions, password_hash, password_salt FROM users WHERE id = ?').bind(id).first();
      if (!target || target.role === 'super_admin') return error('不能调整该账号。');
      if (user.role !== 'super_admin' && target.role !== 'user') return error('只能调整普通用户权限。', 403);
      const role = user.role === 'super_admin' ? (body?.role === 'admin' ? 'admin' : 'user') : target.role;
      const requested = body?.permissions && typeof body.permissions === 'object' ? body.permissions : permissionsFor(target);
      const permissions = { records: Boolean(requested.records), updates: Boolean(requested.updates) };
      const username = body?.username === undefined ? target.username : String(body.username || '').trim().toLowerCase();
      const nickname = body?.nickname === undefined ? target.nickname : String(body.nickname || '').trim().slice(0, 40);
      if (!/^[a-z0-9_.-]{3,40}$/.test(username) || !nickname) return error('账号需为 3–40 位小写字母、数字、._-，昵称不能为空。');
      const passwordChanged = String(body?.password || '').length > 0;
      if (passwordChanged && !assertPassword(body.password)) return error('新密码长度需为 5–128 位。');
      if (role === 'admin' && target.role !== 'admin' && +(await env.DB.prepare('SELECT COUNT(*) AS count FROM users WHERE role = ?').bind('admin').first()).count >= 5) return error('管理员数量最多为 5 个。');
      const password = passwordChanged ? await newPassword(body.password) : { hash: target.password_hash, salt: target.password_salt };
      try { await env.DB.prepare('UPDATE users SET username = ?, nickname = ?, role = ?, permissions = ?, password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?').bind(username, nickname, role, JSON.stringify(permissions), password.hash, password.salt, now(), id).run(); }
      catch { return error('该账号已存在。'); }
      return json({ ok: true });
    }
  }
  return error('接口不存在。', 404);
}

export default { async fetch(request, env) { const url = new URL(request.url); try { return url.pathname.startsWith('/api/') ? await api(request, env, url.pathname) : env.ASSETS.fetch(request); } catch (cause) { console.error(cause); return error('服务暂时不可用，请稍后重试。', 500); } } };

