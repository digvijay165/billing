// ForgeFlow cloud: Supabase login, staff roles and sync across devices.
// The app keeps working offline from a local copy; changes are sent when the internet is back.
(() => {
  const cfg = window.FORGEFLOW_CONFIG || {};
  const enabled = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase?.createClient);
  const COLLECTIONS = ['catalog', 'invoices', 'stock', 'purchases', 'expenses'];
  const LAST = 'forgeflow_cloud_last';
  let FF, sb, user, shop, role, channel, timer;
  let meta = { synced: {}, lastPull: null };
  let pushing = false, pushAgain = false, pulling = false, state = 'idle', lastError = '';

  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const metaKey = () => 'forgeflow_meta_' + shop.id;
  const dataKey = () => 'forgeflow_shop_' + shop.id;
  // Postgres reorders JSON keys, so compare records with sorted keys.
  const sortKeys = v => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => (o[k] = sortKeys(v[k]), o), {}) : v;
  const hash = v => JSON.stringify(sortKeys(v));
  function saveMeta() { try { localStorage.setItem(metaKey(), JSON.stringify(meta)) } catch {} }
  function loadMeta() { try { meta = { synced: {}, lastPull: null, ...JSON.parse(localStorage.getItem(metaKey()) || '{}') } } catch { meta = { synced: {}, lastPull: null } } }

  // Every record becomes one row in the "docs" table, keyed by its id.
  function docsOf(db) {
    const out = new Map();
    out.set('settings', { collection: 'settings', data: db.settings });
    for (const c of COLLECTIONS) for (const d of db[c] || []) if (d && d.id) out.set(d.id, { collection: c, data: d });
    return out;
  }
  function pendingCount() {
    if (!shop) return 0;
    const cur = docsOf(FF.db); let n = 0;
    for (const [id, d] of cur) if (meta.synced[id]?.h !== hash(d.data)) n++;
    for (const id of Object.keys(meta.synced)) if (!cur.has(id)) n++;
    return n;
  }

  // ---- Sending local changes
  async function push() {
    if (!shop || !navigator.onLine) return status();
    if (pushing) { pushAgain = true; return }
    pushing = true; state = 'syncing'; status();
    try {
      const cur = docsOf(FF.db), rows = [];
      for (const [id, d] of cur) { const h = hash(d.data); if (meta.synced[id]?.h !== h) rows.push({ row: { shop_id: shop.id, id, collection: d.collection, data: d.data, deleted: false }, h }) }
      for (const [id, s] of Object.entries(meta.synced)) if (!cur.has(id)) rows.push({ row: { shop_id: shop.id, id, collection: s.c, data: {}, deleted: true }, h: null });
      for (let i = 0; i < rows.length; i += 200) {
        const part = rows.slice(i, i + 200);
        const { error } = await sb.from('docs').upsert(part.map(x => x.row), { onConflict: 'shop_id,id' });
        if (!error) { part.forEach(markSent); continue }
        if (!navigator.onLine || /fetch|network/i.test(error.message)) throw error;
        // One bad row (for example staff deleting a bill) must not block the rest.
        const refused = [];
        for (const x of part) { const r = await sb.from('docs').upsert(x.row, { onConflict: 'shop_id,id' }); if (r.error) refused.push(x.row.id); else markSent(x) }
        if (refused.length) { FF.toast('Some changes were not allowed for your account and were undone.'); await refetch(refused) }
      }
      saveMeta(); state = 'idle'; lastError = '';
    } catch (e) { state = 'error'; lastError = e?.message || 'Could not reach the server' }
    pushing = false; status();
    if (pushAgain) { pushAgain = false; push() }
  }
  function markSent(x) { if (x.h === null) delete meta.synced[x.row.id]; else meta.synced[x.row.id] = { h: x.h, c: x.row.collection } }

  // ---- Receiving changes from other devices
  async function pull() {
    if (!shop || !navigator.onLine || pulling) return;
    pulling = true;
    try {
      const since = meta.lastPull; let from = 0, newest = since;
      for (;;) {
        let q = sb.from('docs').select('id,collection,data,deleted,updated_at').eq('shop_id', shop.id).order('updated_at').order('id').range(from, from + 999);
        if (since) q = q.gt('updated_at', since);
        const { data, error } = await q;
        if (error) throw error;
        if (data.length) { apply(data); newest = data[data.length - 1].updated_at }
        if (data.length < 1000) break;
        from += 1000;
      }
      meta.lastPull = newest; saveMeta();
      if (state === 'error') state = 'idle';
    } catch (e) { state = 'error'; lastError = e?.message || 'Could not reach the server' }
    pulling = false; status();
  }
  async function refetch(ids) {
    const { data } = await sb.from('docs').select('id,collection,data,deleted,updated_at').eq('shop_id', shop.id).in('id', ids);
    const got = new Set((data || []).map(r => r.id));
    // A refused new record never reached the server: drop it locally.
    const missing = ids.filter(id => !got.has(id)).map(id => ({ id, collection: meta.synced[id]?.c || findCollection(id), deleted: true, data: {} }));
    missing.forEach(m => delete meta.synced[m.id]);
    apply([...(data || []), ...missing], true);
  }
  function findCollection(id) { for (const c of COLLECTIONS) if ((FF.db[c] || []).some(d => d.id === id)) return c; return '' }

  // Server rows win unless this device has an unsent edit of the same record.
  function apply(rows, force = false) {
    const db = structuredClone(FF.db); const cur = docsOf(db); let changed = false;
    for (const r of rows) {
      const local = cur.get(r.id);
      const localPending = local && meta.synced[r.id]?.h !== hash(local.data);
      if (localPending && !force) continue;
      const h = hash(r.data);
      if (!r.deleted && local && hash(local.data) === h) { meta.synced[r.id] = { h, c: r.collection }; continue }
      if (r.collection === 'settings') {
        if (!r.deleted) { db.settings = { ...db.settings, ...r.data }; meta.synced.settings = { h: hash(db.settings), c: 'settings' }; changed = true }
        continue;
      }
      const list = db[r.collection]; if (!list) continue;
      const i = list.findIndex(d => d.id === r.id);
      if (r.deleted) { if (i >= 0) { list.splice(i, 1); changed = true } delete meta.synced[r.id] }
      else { if (i >= 0) list[i] = r.data; else list.push(r.data); meta.synced[r.id] = { h, c: r.collection }; changed = true }
    }
    saveMeta();
    if (changed) FF.replaceDb(db);
  }

  // ---- The shop's own uploaded MRP price lists (a shop can have several, e.g. one per company)
  // Kept on this device under a key for this shop only, and in the cloud where only this shop can read them.
  // The local record is {lists, removed} (see plNorm in index.html). Each list may carry `pending`:
  // true = upload it, 'rename' = send its new name, 'claim' = an old list from before lists were per shop,
  // uploaded only if the shop has none yet. `removed` holds ids of lists to delete from the shop.
  const LEGACY_PL = 'pricelist', CHUNK = 5000;
  let plBusy = false, plAgain = false;
  const plKey = () => 'pricelist_' + shop.id;
  const plSig = rec => rec.lists.map(l => l.id + ':' + (l.version || '') + ':' + l.name + ':' + (l.pending || '')).join('|');
  async function syncPriceList() {
    if (!shop || !navigator.onLine) return;
    if (plBusy) { plAgain = true; return }
    plBusy = true;
    const id = shop.id, key = plKey();
    let before = '';
    try {
      let local = FF.plNorm(null); try { local = FF.plNorm(await FF.idbGet(key)) } catch {}
      before = plSig(local);
      const owner = role === 'owner';
      if (owner) {
        for (const lid of local.removed) {
          let r = await sb.from('price_lists').delete().eq('shop_id', id).eq('list_id', lid); if (r.error) throw r.error;
          r = await sb.from('price_list_chunks').delete().eq('shop_id', id).eq('list_id', lid); if (r.error) throw r.error;
          await FF.plUpdate(key, rec => { rec.removed = rec.removed.filter(x => x !== lid); return rec });
        }
      }
      const list = async () => { const r = await sb.from('price_lists').select('list_id,version,name,parts,chunks').eq('shop_id', id).order('updated_at'); if (r.error) throw r.error; return r.data };
      let cur = await list();
      if (owner) {
        let changed = false;
        for (const l of local.lists) {
          if (l.pending === true || (l.pending === 'claim' && !cur.length)) {
            const version = crypto.randomUUID(), n = Math.ceil(l.rows.length / CHUNK);
            for (let i = 0; i < n; i++) {
              const r = await sb.from('price_list_chunks').insert({ shop_id: id, list_id: l.id, version, n: i, rows: l.rows.slice(i * CHUNK, (i + 1) * CHUNK) });
              if (r.error) throw r.error;
            }
            let r = await sb.from('price_lists').upsert({ shop_id: id, list_id: l.id, version, name: l.name, parts: l.rows.length, chunks: n, updated_at: new Date().toISOString() });
            if (r.error) throw r.error;
            await sb.from('price_list_chunks').delete().eq('shop_id', id).eq('list_id', l.id).neq('version', version);
            // Only mark it saved if it wasn't replaced again while uploading.
            await FF.plUpdate(key, rec => { const x = rec.lists.find(y => y.id === l.id); if (x && x.importedAt === l.importedAt && x.pending === l.pending) { x.version = version; delete x.pending } return rec });
            FF.toast(`${l.name} saved to your shop: ${l.rows.length.toLocaleString('en-IN')} parts.`);
            changed = true;
          } else if (l.pending === 'rename' && l.version) {
            const r = await sb.from('price_lists').update({ name: l.name }).eq('shop_id', id).eq('list_id', l.id); if (r.error) throw r.error;
            await FF.plUpdate(key, rec => { const x = rec.lists.find(y => y.id === l.id); if (x && x.pending === 'rename' && x.name === l.name) delete x.pending; return rec });
            changed = true;
          }
        }
        if (changed) cur = await list();
      }
      // Download lists that are new or changed on another device.
      local = FF.plNorm(await FF.idbGet(key));
      const got = new Map();
      for (const c of cur) {
        const l = local.lists.find(x => x.id === c.list_id);
        if (local.removed.includes(c.list_id) || (l && (l.version === c.version || (owner && l.pending === true)))) continue;
        const rows = [];
        for (let i = 0; i < c.chunks; i += 4) {
          const r = await sb.from('price_list_chunks').select('n,rows').eq('shop_id', id).eq('version', c.version).gte('n', i).lt('n', i + 4).order('n');
          if (r.error) throw r.error;
          for (const ch of r.data) rows.push(...ch.rows);
        }
        if (rows.length !== c.parts) continue; // Still being uploaded; try again later.
        got.set(c.list_id, { id: c.list_id, name: c.name, rows, version: c.version });
      }
      const ids = new Map(cur.map(c => [c.list_id, c]));
      const rec = await FF.plUpdate(key, rec => {
        // Drop lists the shop no longer has (keeping the owner's unsent ones), apply downloads and renames.
        rec.lists = rec.lists.filter(l => ids.has(l.id) || (owner && (l.pending === true || (l.pending === 'claim' && !cur.length))))
          .map(l => { const g = got.get(l.id); if (g && !(owner && l.pending === true)) return g; const c = ids.get(l.id); if (c && l.version === c.version && !l.pending && l.name !== c.name) l.name = c.name; return l });
        for (const [lid, g] of got) if (!rec.lists.some(x => x.id === lid)) rec.lists.push(g);
        return rec;
      });
      if (plSig(rec) !== before && shop?.id === id) FF.usePriceList(key);
    } catch (e) {
      if (role === 'owner') console.warn('Price list sync failed; will retry.', e);
    } finally {
      plBusy = false;
      if (plAgain) { plAgain = false; syncPriceList() }
    }
  }
  // Lists uploaded before lists were per shop were shared by everyone on the device.
  // Hand such a list to the first shop owner who opens here, then remove the shared copy.
  async function adoptLegacyPriceList() {
    try {
      const old = FF.plNorm(await FF.idbGet(LEGACY_PL)); await FF.idbDel(LEGACY_PL);
      if (role !== 'owner' || !old.lists.length || FF.plNorm(await FF.idbGet(plKey())).lists.length) return;
      await FF.idbPut(plKey(), { lists: old.lists.map(l => ({ ...l, version: undefined, pending: 'claim' })), removed: [] });
    } catch {}
  }

  function subscribe() {
    channel?.unsubscribe();
    channel = sb.channel('docs-' + shop.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'docs', filter: 'shop_id=eq.' + shop.id }, p => { if (p.new?.id) apply([p.new]) })
      .subscribe();
  }

  // ---- Sidebar status
  function status() {
    const el = document.getElementById('cloud-status'); if (!el || !shop) return;
    const n = pendingCount();
    const line = !navigator.onLine ? `<span class="local-dot wait"></span>Offline${n ? ` · ${n} change${n === 1 ? '' : 's'} waiting` : ''}`
      : state === 'error' ? `<span class="local-dot err"></span><span title="${esc(lastError)}">Sync problem — retrying</span>`
      : state === 'syncing' || n ? `<span class="local-dot wait"></span>Saving to cloud…`
      : `<span class="local-dot"></span>Saved to cloud`;
    el.innerHTML = `<div>${line}</div><div class="cloud-user">${esc(user?.email || '')} · ${role === 'owner' ? 'Owner' : 'Staff'}</div><button class="link-btn" data-cloud="signout">Sign out</button>`;
  }

  // ---- Sign-in screens
  function screen(kind, msg = '') {
    let el = document.getElementById('auth-layer');
    if (!el) { el = document.createElement('div'); el.id = 'auth-layer'; document.body.append(el) }
    const name = esc(FF?.db?.settings?.businessName && FF.db.settings.businessName !== 'Your workshop' ? FF.db.settings.businessName : 'ForgeFlow');
    const note = msg ? `<div class="auth-msg">${msg}</div>` : '';
    const body = {
      loading: `<p class="muted">Opening your shop…</p>`,
      signin: `<h2>Sign in</h2><p class="muted">Use the email and password for your shop account.</p>${note}<form data-auth="signin"><label>Email</label><input class="field" name="email" type="email" autocomplete="email" required><label>Password</label><input class="field" name="password" type="password" autocomplete="current-password" required><button class="btn primary big">Sign in</button></form><div class="auth-links"><button class="link-btn" data-auth-go="signup">Create an account</button><button class="link-btn" data-auth-go="reset">Forgot password?</button></div>`,
      signup: `<h2>Create an account</h2><p class="muted">Shop owners: create your account, then name your shop.<br>Staff: use the email your owner invited.</p>${note}<form data-auth="signup"><label>Email</label><input class="field" name="email" type="email" autocomplete="email" required><label>Password (at least 8 characters)</label><input class="field" name="password" type="password" minlength="8" autocomplete="new-password" required><button class="btn primary big">Create account</button></form><div class="auth-links"><button class="link-btn" data-auth-go="signin">I already have an account</button></div>`,
      reset: `<h2>Reset password</h2><p class="muted">We'll email you a link to set a new password.</p>${note}<form data-auth="reset"><label>Email</label><input class="field" name="email" type="email" required><button class="btn primary big">Send reset link</button></form><div class="auth-links"><button class="link-btn" data-auth-go="signin">Back to sign in</button></div>`,
      newpass: `<h2>Set a new password</h2>${note}<form data-auth="newpass"><label>New password</label><input class="field" name="password" type="password" minlength="8" autocomplete="new-password" required><button class="btn primary big">Save password</button></form>`,
      setup: `<h2>Set up your shop</h2><p class="muted">Signed in as <b>${esc(user?.email)}</b>.</p>${note}<form data-auth="setup"><label>Shop name</label><input class="field" name="name" required placeholder="e.g. Singh Machine Works" value="${FF.db.settings.businessName !== 'Your workshop' ? esc(FF.db.settings.businessName) : ''}"><button class="btn primary big">Create my shop</button></form><div class="hint-box">Bills already saved on this device will be copied into your new shop.<br><br><b>Are you staff?</b> Don't create a shop. Ask the owner to invite <b>${esc(user?.email)}</b> in Business settings → Team, then <button class="link-btn" data-auth-go="retry" style="color:var(--green)">check again</button>.</div><div class="auth-links"><button class="link-btn" data-cloud="signout">Sign out</button></div>`,
    }[kind];
    el.innerHTML = `<div class="auth-card"><div class="brand auth-brand"><div class="brand-mark">F</div><div><div class="brand-name">${name}</div><div class="brand-sub" style="color:var(--muted)">Workshop billing</div></div></div>${body}</div>`;
    el.querySelector('input')?.focus();
  }
  function hideScreen() { document.getElementById('auth-layer')?.remove() }

  async function handleAuth(form) {
    const d = Object.fromEntries(new FormData(form)); const kind = form.dataset.auth;
    const btn = form.querySelector('button'); btn.disabled = true; btn.textContent = 'Please wait…';
    try {
      if (kind === 'signin') {
        const { data, error } = await sb.auth.signInWithPassword({ email: d.email.trim(), password: d.password });
        if (error) throw error; await enter(data.user);
      } else if (kind === 'signup') {
        const { data, error } = await sb.auth.signUp({ email: d.email.trim(), password: d.password, options: { emailRedirectTo: location.href.split('#')[0] } });
        if (error) throw error;
        if (data.session) await enter(data.user);
        else screen('signin', `Check <b>${esc(d.email)}</b> for a confirmation email, click the link, then sign in here.`);
      } else if (kind === 'reset') {
        const { error } = await sb.auth.resetPasswordForEmail(d.email.trim(), { redirectTo: location.href.split('#')[0] });
        if (error) throw error; screen('signin', 'Reset link sent. Open it from your email to set a new password.');
      } else if (kind === 'newpass') {
        const { error } = await sb.auth.updateUser({ password: d.password });
        if (error) throw error; FF.toast('Password updated.'); const { data } = await sb.auth.getUser(); await enter(data.user);
      } else if (kind === 'setup') {
        const { data: id, error } = await sb.rpc('create_shop', { p_name: d.name });
        if (error) throw error;
        await open({ id, name: d.name.trim() }, 'owner', true);
      }
    } catch (e) {
      const m = String(e?.message || e);
      screen(kind, esc(/invalid login/i.test(m) ? 'Wrong email or password.' : /not confirmed/i.test(m) ? 'Please confirm your email first — check your inbox.' : /fetch|network/i.test(m) ? 'No internet connection.' : m));
    }
  }

  // ---- Opening a shop after sign-in
  async function enter(u) {
    user = u; screen('loading');
    let membership = null;
    try {
      await sb.rpc('accept_invite');
      const { data, error } = await sb.from('members').select('role, shops(id, name)').eq('user_id', u.id).limit(1);
      if (error) throw error;
      if (data?.[0]) membership = { shop: data[0].shops, role: data[0].role };
    } catch {
      // Offline: reopen the last shop from this device's copy.
      try { const last = JSON.parse(localStorage.getItem(LAST)); if (last?.userId === u.id) membership = last } catch {}
      if (!membership) return screen('signin', 'No internet connection. Connect once to open your shop on this device.');
    }
    if (!membership) return screen('setup');
    await open(membership.shop, membership.role, false);
  }

  async function open(s, r, isNew) {
    shop = s; role = r;
    try { localStorage.setItem(LAST, JSON.stringify({ userId: user.id, shop: s, role: r })) } catch {}
    loadMeta();
    let cached = null; try { cached = JSON.parse(localStorage.getItem(dataKey())) } catch {}
    if (isNew) {
      // Copy this device's existing bills into the new shop; everything is unsent, so it all uploads.
      const local = FF.localDb();
      if (!local.settings.businessName || local.settings.businessName === 'Your workshop') local.settings.businessName = s.name;
      FF.useStore(dataKey(), local); meta = { synced: {}, lastPull: null }; saveMeta();
      // Moved, not copied: another account opening a shop on this device must not get them too.
      FF.clearLocal();
    } else if (cached) FF.useStore(dataKey(), cached);
    else {
      // First time on this device: start empty and take everything (including settings) from the server.
      FF.useStore(dataKey(), FF.emptyDb()); meta = { synced: { settings: { h: hash(FF.db.settings), c: 'settings' } }, lastPull: null }; saveMeta();
    }
    FF.setRole(r);
    await adoptLegacyPriceList();
    FF.usePriceList(plKey());
    hideScreen();
    document.body.classList.add('cloud-on');
    subscribe();
    await pull(); await push(); syncPriceList();
    clearInterval(timer); timer = setInterval(() => { pull(); push(); syncPriceList() }, 60000);
  }

  // ---- Team (owner only), shown in Business settings
  async function renderTeam() {
    const el = document.getElementById('team-card'); if (!el || !shop) return;
    if (role !== 'owner') { el.innerHTML = ''; return }
    el.innerHTML = `<div class="card-title">Team</div><div class="card-note">Loading…</div>`;
    const [m, i] = await Promise.all([sb.from('members').select('user_id,email,role').eq('shop_id', shop.id), sb.from('invites').select('email').eq('shop_id', shop.id)]);
    if (m.error) { el.innerHTML = `<div class="card-title">Team</div><div class="card-note">Could not load the team. Check your internet.</div>`; return }
    const rows = m.data.map(x => `<tr><td><b>${esc(x.email || '—')}</b>${x.user_id === user.id ? ' <span class="tag">YOU</span>' : ''}</td><td>${x.role === 'owner' ? 'Owner' : 'Staff'}</td><td class="right">${x.role === 'staff' ? `<button class="btn small danger" data-cloud="remove-member" data-user="${esc(x.user_id)}">Remove</button>` : ''}</td></tr>`).join('')
      + (i.data || []).map(x => `<tr><td>${esc(x.email)}</td><td class="muted">Invited — waiting for sign-up</td><td class="right"><button class="btn small" data-cloud="cancel-invite" data-email="${esc(x.email)}">Cancel</button></td></tr>`).join('');
    el.innerHTML = `<div class="card-title">Team</div><div class="card-note">Staff can make bills, take payments, record purchases and update stock. They can't delete anything, see reports or expenses, or change settings.</div><div class="table-wrap" style="margin-top:12px"><table><tbody>${rows}</tbody></table></div><form id="invite-form" class="setting-actions"><input class="field" name="email" type="email" required placeholder="Staff email address" style="flex:1;min-width:200px"><button class="btn primary">＋ Invite staff</button></form><div class="helper">After you invite them, they open this website, choose “Create an account” with that email, and they're in.</div>`;
  }

  function bindEvents() {
    document.addEventListener('submit', async e => {
      const f = e.target;
      if (f.dataset.auth) { e.preventDefault(); handleAuth(f); return }
      if (f.id === 'invite-form') {
        e.preventDefault(); const email = new FormData(f).get('email').trim().toLowerCase();
        const { error } = await sb.from('invites').insert({ shop_id: shop.id, email });
        FF.toast(error ? (/duplicate/i.test(error.message) ? 'Already invited.' : 'Could not invite: ' + error.message) : `Invited ${email}.`); renderTeam();
      }
    });
    document.addEventListener('click', async e => {
      const t = e.target;
      const go = t.closest('[data-auth-go]');
      if (go) { if (go.dataset.authGo === 'retry') enter(user); else screen(go.dataset.authGo); return }
      const c = t.closest('[data-cloud]'); if (!c) return;
      const act = c.dataset.cloud;
      if (act === 'signout') {
        const waiting = shop && pendingCount();
        if (waiting && !confirm('Some changes are not saved to the cloud yet. Sign out anyway? They stay on this device.')) return;
        // Everything is in the cloud: remove this shop's copy so the next person on this device can't see it.
        if (shop && !waiting) {
          let pl = null; try { pl = await FF.idbGet(plKey()) } catch {}
          if (!FF.plPending(pl)) { try { await FF.idbDel(plKey()) } catch {} }
          try { [dataKey(), metaKey(), LAST].forEach(k => localStorage.removeItem(k)) } catch {}
        }
        await sb.auth.signOut(); location.reload();
      }
      if (act === 'remove-member') { if (!confirm('Remove this staff member? They will no longer be able to open your shop.')) return; const { error } = await sb.from('members').delete().eq('shop_id', shop.id).eq('user_id', c.dataset.user); FF.toast(error ? 'Could not remove: ' + error.message : 'Staff member removed.'); renderTeam() }
      if (act === 'cancel-invite') { await sb.from('invites').delete().eq('shop_id', shop.id).eq('email', c.dataset.email); renderTeam() }
    });
    addEventListener('online', () => { pull(); push(); syncPriceList() });
    addEventListener('offline', status);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { pull(); push(); syncPriceList() } });
    addEventListener('beforeunload', e => { if (shop && pendingCount() && navigator.onLine) { push(); e.preventDefault(); e.returnValue = '' } });
  }

  async function start(app) {
    FF = app;
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    bindEvents();
    let recovering = /type=recovery/.test(location.hash);
    sb.auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY') { recovering = true; screen('newpass') } });
    screen('loading');
    const { data: { session } } = await sb.auth.getSession();
    if (recovering) return screen('newpass');
    if (!session) return screen('signin');
    await enter(session.user);
  }

  let changeTimer;
  window.Cloud = {
    enabled,
    start,
    changed() { if (!shop) return; status(); clearTimeout(changeTimer); changeTimer = setTimeout(push, 400) },
    renderTeam,
    status,
    priceListChanged() { syncPriceList() },
  };
})();
