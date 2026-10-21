(() => {
  'use strict';

  // one text file per list, fetched on load. hint shows in the editor.
  const LISTS = {
    plugins:    { file: '/unblock/lists/plugins.txt',    hint: 'name | roles, comma separated | note' },
    techniques: { file: '/unblock/lists/techniques.txt', hint: 'technique | | note' },
    remakes:    { file: '/unblock/lists/remakes.txt',    hint: 'song and artist | | note' },
    artists:    { file: '/unblock/lists/artists.txt',    hint: 'artist | | note' },
    genres:     { file: '/unblock/lists/genres.txt',     hint: 'genre | years, like 1965-1980 | bpm, like 70-100' },
    clocks:     { file: '/unblock/lists/clocks.txt',     hint: 'constraint | minutes' }
  };

  // which slots each mode draws, in order
  const MODES = { start: ['seed', 'palette', 'clock'], stuck: ['technique', 'clock'] };

  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const btn = (label, act) => {
    const b = el('button', '', label);
    b.type = 'button';
    b.dataset.act = act;
    return b;
  };
  const rnd = (n) => Math.floor(Math.random() * n);

  // localStorage can throw or come back empty, so every call is wrapped
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  const defaults = {};
  const overrides = store.get('unblock.lists', {});
  const done = new Set(store.get('unblock.done', []));
  const S = { mode: store.get('unblock.mode', 'start'), cards: {} };
  if (!MODES[S.mode]) S.mode = 'start';

  const grid = $('#cards');

  // lines starting with # are comments. fields are split on |
  function parse(text) {
    return String(text || '').split('\n').map((l) => l.trim())
      .filter((l) => l && l[0] !== '#')
      .map((l) => {
        const p = l.split('|').map((s) => s.trim());
        return { name: p[0], meta: p[1] || '', note: p[2] || '' };
      })
      .filter((i) => i.name);
  }
  const items = (k) => parse(k in overrides ? overrides[k] : defaults[k]);

  function pick(arr, avoid) {
    const pool = arr.length > 1 ? arr.filter((i) => i.name !== avoid) : arr;
    return pool[rnd(pool.length)];
  }

  // "1965-1980" with a window of 10 returns a random 10 year slice
  function subrange(str, w) {
    const m = /^(\d+)\s*-\s*(\d+)$/.exec(str);
    if (!m) return str;
    const a = +m[1], b = +m[2];
    if (b - a <= w) return a + '-' + b;
    const s = a + rnd(b - a - w + 1);
    return s + '-' + (s + w);
  }

  const empty = (k) => ({ key: '', title: 'this list is empty', kind: '', sub: 'add lines to ' + k + ' under edit lists.' });

  function draw(slot, prev) {
    const avoid = prev && prev.key;

    if (slot === 'palette') {
      const it = pick(items('plugins'), avoid);
      if (!it) return empty('plugins');
      const roles = it.meta.split(',').map((s) => s.trim()).filter(Boolean);
      const role = roles.length ? roles[rnd(roles.length)] : '';
      return { key: it.name, title: it.name, kind: role ? 'as the ' + role : 'any role', sub: it.note };
    }

    if (slot === 'technique') {
      const it = pick(items('techniques'), avoid);
      if (!it) return empty('techniques');
      return { key: it.name, title: it.name, kind: 'use this', sub: it.note };
    }

    if (slot === 'clock') {
      const it = pick(items('clocks'), avoid);
      if (!it) return empty('clocks');
      return { key: it.name, title: it.name, kind: 'time box', sub: it.note, minutes: parseInt(it.meta, 10) || 0 };
    }

    if (slot === 'seed') {
      const kinds = [];
      const remakes = items('remakes').filter((i) => !done.has(i.name));
      if (remakes.length) kinds.push('remake');
      if (items('artists').length) kinds.push('artist');
      if (items('genres').length) kinds.push('sample');
      if (!kinds.length) return empty('remakes, artists or genres');
      const kind = kinds[rnd(kinds.length)];

      if (kind === 'remake') {
        const it = pick(remakes, avoid);
        return { key: it.name, title: it.name, kind: 'remake', sub: it.note, remake: true, done: false };
      }
      if (kind === 'artist') {
        const it = pick(items('artists'), avoid);
        return {
          key: it.name, title: it.name, kind: 'model the session on',
          sub: it.note || 'borrow the arrangement and the drum feel, not the sound.'
        };
      }
      const it = pick(items('genres'), avoid);
      const years = subrange(it.meta, 10);
      const bpm = subrange(it.note, 20);
      const parts = [it.name, years, bpm ? bpm + ' bpm' : ''].filter(Boolean);
      return {
        key: it.name, title: parts.join(', '), kind: 'sample hunt',
        sub: 'set these filters on samplette.io and take the first loop that does something.',
        link: 'https://samplette.io'
      };
    }
    return empty(slot);
  }

  function cardState(slot) {
    return S.cards[slot] || (S.cards[slot] = { data: null, locked: false, rerolled: false });
  }

  function cardEl(slot, i) {
    const c = cardState(slot);
    const d = c.data;
    const a = el('article', 'card' + (c.locked ? ' locked' : ''));
    a.dataset.slot = slot;

    const head = el('div', 'ch');
    head.append(el('span', 'num', String(i + 1)), el('span', 'slot', slot));
    if (c.locked) head.append(el('span', 'tag', 'locked'));
    a.append(head);

    if (!d) {
      a.append(el('h2', 'val dim', 'roll to draw'));
    } else {
      if (d.kind) a.append(el('p', 'kind', d.kind));
      a.append(el('h2', 'val', d.title));
      if (d.sub) a.append(el('p', 'sub', d.sub));
    }

    const acts = el('div', 'acts');
    if (d && d.key) {
      const rr = btn(c.rerolled ? 'rerolled' : 'reroll', 'reroll');
      rr.disabled = c.locked || c.rerolled;
      const lk = btn(c.locked ? 'unlock' : 'lock', 'lock');
      lk.setAttribute('aria-pressed', String(c.locked));
      acts.append(rr, lk);
      if (d.minutes) acts.append(btn('start ' + d.minutes + ' min', 'box'));
      if (d.remake) {
        const m = btn(d.done ? 'marked done' : 'mark done', 'done');
        m.disabled = d.done;
        acts.append(m);
      }
      if (d.link) {
        const l = el('a', 'btn', 'open samplette');
        l.href = d.link;
        l.target = '_blank';
        l.rel = 'noopener';
        acts.append(l);
      }
    }
    a.append(acts);
    return a;
  }

  function render() {
    const slots = MODES[S.mode];
    grid.style.setProperty('--cols', slots.length);
    grid.replaceChildren(...slots.map(cardEl));
    document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === S.mode)));
  }

  // re-render one card and keep keyboard focus on the same action
  function renderCard(slot) {
    const old = grid.querySelector('[data-slot="' + slot + '"]');
    if (!old) return;
    const act = document.activeElement && old.contains(document.activeElement) ? document.activeElement.dataset.act : null;
    const fresh = cardEl(slot, MODES[S.mode].indexOf(slot));
    old.replaceWith(fresh);
    if (act) {
      const t = fresh.querySelector('[data-act="' + act + '"]:not(:disabled)') || fresh.querySelector('button:not(:disabled)');
      if (t) t.focus();
    }
  }

  function roll() {
    MODES[S.mode].forEach((slot) => {
      const c = cardState(slot);
      if (c.locked) return;
      c.data = draw(slot, c.data);
      c.rerolled = false;
    });
    render();
    $('#msg').textContent = '';
  }

  grid.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    const slot = b.closest('article').dataset.slot;
    const c = cardState(slot);
    const act = b.dataset.act;
    if (act === 'reroll' && !c.locked && !c.rerolled) {
      c.data = draw(slot, c.data);
      c.rerolled = true;
    } else if (act === 'lock') {
      c.locked = !c.locked;
    } else if (act === 'box') {
      setTimer(c.data.minutes, true);
    } else if (act === 'done' && c.data && c.data.remake) {
      done.add(c.data.key);
      store.set('unblock.done', [...done]);
      c.data.done = true;
    }
    renderCard(slot);
  });

  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    S.mode = b.dataset.mode;
    store.set('unblock.mode', S.mode);
    render();
  }));
  $('#roll').addEventListener('click', roll);

  $('#copy').addEventListener('click', () => {
    const lines = ['boi rd unblock'];
    MODES[S.mode].forEach((slot) => {
      const d = cardState(slot).data;
      if (d && d.key) lines.push(slot + ': ' + d.title + (d.kind && slot === 'palette' ? ' (' + d.kind + ')' : ''));
    });
    lines.push('boi-rd.com/unblock');
    const text = lines.join('\n');
    const ok = () => { $('#msg').textContent = 'copied.'; };
    const bad = () => { $('#msg').textContent = 'copy blocked by the browser.'; };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, bad);
    else bad();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'r' || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return;
    if ($('#editor').open) return;
    roll();
  });

  // session timer. end time is a timestamp so a throttled tab stays accurate
  const T = { total: 90 * 60, left: 90 * 60, end: 0, run: false, iv: null };

  function fmt(s) {
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }
  function paintTimer() {
    $('#tdisp').textContent = fmt(T.left);
    $('#tfill').style.width = (T.total ? (1 - T.left / T.total) * 100 : 0) + '%';
    $('#tgo').textContent = T.run ? 'pause' : 'start';
    document.title = T.run ? fmt(T.left) + ' | unblock | boi rd' : 'unblock | boi rd';
  }
  function stopTimer() {
    T.run = false;
    clearInterval(T.iv);
    paintTimer();
  }
  function startTimer() {
    if (T.left <= 0) T.left = T.total;
    T.end = Date.now() + T.left * 1000;
    T.run = true;
    clearInterval(T.iv);
    T.iv = setInterval(tick, 250);
    paintTimer();
  }
  function setTimer(mins, go) {
    stopTimer();
    T.total = T.left = mins * 60;
    paintTimer();
    if (go) startTimer();
  }
  function beep() {
    try {
      const a = new (window.AudioContext || window.webkitAudioContext)();
      const o = a.createOscillator();
      const g = a.createGain();
      o.connect(g);
      g.connect(a.destination);
      o.frequency.value = 660;
      g.gain.value = 0.15;
      o.start();
      o.stop(a.currentTime + 0.3);
    } catch (e) {}
  }
  function tick() {
    T.left = Math.max(0, Math.ceil((T.end - Date.now()) / 1000));
    if (T.left === 0) { stopTimer(); beep(); return; }
    paintTimer();
  }

  $('#tgo').addEventListener('click', () => (T.run ? stopTimer() : startTimer()));
  $('#treset').addEventListener('click', () => setTimer(T.total / 60, false));
  document.querySelectorAll('[data-min]').forEach((b) => b.addEventListener('click', () => setTimer(+b.dataset.min, false)));

  // list editor. edits save to this browser only. download to put them back in the site files
  const dlg = $('#editor');
  const ta = $('#edtext');
  let cur = 'plugins';

  function loadTab() {
    ta.value = cur in overrides ? overrides[cur] : defaults[cur] || '';
    $('#edhint').textContent = 'format: ' + LISTS[cur].hint + '. lines starting with # are ignored.';
    $('#edmsg').textContent = '';
    document.querySelectorAll('#edtabs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === cur)));
  }
  Object.keys(LISTS).forEach((k) => {
    const b = el('button', '', k);
    b.type = 'button';
    b.dataset.k = k;
    b.addEventListener('click', () => { cur = k; loadTab(); });
    $('#edtabs').append(b);
  });

  $('#edit').addEventListener('click', () => { loadTab(); dlg.showModal(); });
  $('#edclose').addEventListener('click', () => dlg.close());
  $('#edsave').addEventListener('click', () => {
    overrides[cur] = ta.value;
    store.set('unblock.lists', overrides);
    $('#edmsg').textContent = 'saved in this browser (' + items(cur).length + ' items). download to keep it in the site files.';
  });
  $('#edreset').addEventListener('click', () => {
    delete overrides[cur];
    store.set('unblock.lists', overrides);
    loadTab();
    $('#edmsg').textContent = 'back to the file version.';
  });
  $('#eddl').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([ta.value], { type: 'text/plain' }));
    const a = el('a');
    a.href = url;
    a.download = cur + '.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('#eddone').addEventListener('click', () => {
    done.clear();
    store.set('unblock.done', []);
    $('#edmsg').textContent = 'done list cleared. all remakes can come back.';
  });

  Promise.all(Object.keys(LISTS).map((k) =>
    fetch(LISTS[k].file, { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(k); return r.text(); })
      .then((t) => { defaults[k] = t; })
  )).then(() => {
    render();
    paintTimer();
  }).catch(() => {
    grid.replaceChildren(el('p', 'sub', 'could not load the lists. check that /unblock/lists/ is deployed, and open this page from the site, not from a file.'));
  });
})();
