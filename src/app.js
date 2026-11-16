(() => {
  'use strict';
  const C = WordLabCore;
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const icons = {
    lab: '<path d="M9 3h6m-5 0v7L4 20h16l-6-10V3M8 14h8m-5 3h2"/>',
    home: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    forge: '<path d="m12 2 8 5v10l-8 5-8-5V7Z M4 7l8 5 8-5M12 12v10M8 4l8 5"/>',
    surgeon: '<path d="m16 3 5 5-11 11-7 2 2-7ZM12 7l5 5M3 5h5M5.5 2.5v5"/>',
    trail: '<rect x="4" y="9" width="16" height="12" rx="3"/><path d="M8 9V6a4 4 0 0 1 8 0v3m-4 5v3"/>',
    wifi: '<path d="m4 9 2 2m3 3 3 3m6-6 2-2M2 4l20 16M8 6a15 15 0 0 1 14 2M3 8l2-1M9 11a8 8 0 0 1 9 1"/>'
  };
  const svg = (name, size = 24) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.lab}</svg>`;
  const games = {
    forge: {name:'Morpheme Forge', subtitle:'A little chemistry. A lot of word power.', description:'Build a word from its parts, then make it your own.', skill:'Build · Spell', accent:'#b9ed80', rgb:'185,237,128', label:'THE WORD WORKSHOP'},
    surgeon: {name:'Word Surgeon', subtitle:'Steady hands. Sharper vocabulary.', description:'Make the diagnosis. Find the cuts. Know every part.', skill:'Spell · Dissect', accent:'#8edcf4', rgb:'142,220,244', label:'THE LANGUAGE LAB'},
    trail: {name:'Decryption Trail', subtitle:'Three gates. One word. You’ve got this.', description:'Decode the meaning, crack the structure, unlock the word.', skill:'Decode · Recall', accent:'#c7afff', rgb:'199,175,255', label:'THE VOCABULARY VAULT'}
  };
  const mode = document.body.dataset.game;
  const params = new URLSearchParams(location.search);
  const requestedSets = params.has('sets') ? params.get('sets').split(',').map(s => s.trim()).filter(Boolean) : null;
  const requestedFiles = (params.get('db_file') || '').split(',').map(s => s.trim()).filter(Boolean);
  let selectedSets = requestedSets ? C.sets.filter(s => requestedSets.includes(String(s.id))).map(s => s.id)
    : requestedFiles.length ? C.sets.filter(s => requestedFiles.includes(s.file)).map(s => s.id) : C.sets.map(s => s.id);
  let launcherOverrides = params.has('sets') || !params.has('db_file');
  let difficulty = Object.hasOwn(C.difficulties, params.get('difficulty')) ? params.get('difficulty') : 'medium';
  const embeddedSets = JSON.parse($('#embedded-sets').textContent);
  const includedRecords = files => files.flatMap(file => C.parseCSV(embeddedSets[file]).records);
  const storage = {
    get(key, fallback) { try { return JSON.parse(localStorage.getItem(`wordlab:${key}`)) ?? fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(`wordlab:${key}`, JSON.stringify(value)); } catch { /* Private browsing may disable storage. */ } }
  };
  let saved = storage.get('stats', {});
  let settings = {...{rounds:10, timed:true, sound:false}, ...storage.get('settings', {})};
  if (mode === 'surgeon' && params.has('difficulty')) settings.timed = true;
  let words = [], deck = [], source = '', loadMessage = '', imported = false;
  let state, modal = null, timerId = null, deadline = 0, remaining = 0, timerCallback = null;
  let selectedTile = null, drag = null;
  if (games[mode]) { document.documentElement.style.setProperty('--accent',games[mode].accent); document.documentElement.style.setProperty('--accent-rgb',games[mode].rgb); }
  function href(game) {
    const query = new URLSearchParams(location.search);
    if (imported) query.set('use_import','1');
    if (mode === 'index') {
      query.set('difficulty',difficulty);
      if (launcherOverrides && !imported) {
        query.set('sets',selectedSets.join(','));
        query.set('db_file',C.sets.filter(s => selectedSets.includes(s.id)).map(s => s.file).join(','));
        query.delete('use_import');
      }
    }
    return `${game}.html${query.size ? '?' + query.toString() : ''}`;
  }
  function launcherSummary() {
    if (imported) return `${words.length} imported terms ready. Select sets to use the included vocabulary instead.`;
    if (!launcherOverrides) return 'Using the CSV files in this URL. Select sets to switch to the included vocabulary.';
    if (!selectedSets.length) return 'Select at least one set to start a game.';
    const count = C.merge(includedRecords(C.sets.filter(s => selectedSets.includes(s.id)).map(s => s.file))).length;
    return `${selectedSets.length} sets selected · ${count} unique terms ready`;
  }
  function refreshLauncher() {
    const disabled = launcherOverrides && !imported && !selectedSets.length;
    document.querySelectorAll('[data-game-link]').forEach(link => {
      if (disabled) { link.removeAttribute('href'); link.setAttribute('aria-disabled','true'); }
      else { link.setAttribute('href',href(link.dataset.gameLink)); link.removeAttribute('aria-disabled'); }
    });
    $('#set-summary').textContent = launcherSummary();
  }
  function shell() {
    $('#app').innerHTML = `<div class="shell"><aside class="sidebar"><a class="brand" href="${esc(href('index'))}" aria-label="Wordlab home">${svg('lab',29)}wordlab<span class="accent">.</span></a>
      <div><div class="nav-label">YOUR LEARNING SPACE</div><nav class="nav" aria-label="Games"><a class="${mode === 'index' ? 'active' : ''}" href="${esc(href('index'))}">${svg('home')}Overview</a>${Object.entries(games).map(([key,g]) => `<a class="${mode === key ? 'active' : ''}" data-game-link="${key}" href="${esc(href(key))}" ${mode === key ? 'aria-current="page"' : ''}>${svg(key)}${g.name}</a>`).join('')}</nav></div>
      <div class="sidebar-bottom"><p><span class="status-dot"></span>A little practice, every day.</p>Spelling. Structure. Meaning.</div></aside>
      <main class="main"><header class="topbar"><div>Learning space <span aria-hidden="true"> / </span> <strong>${mode === 'index' ? 'Overview' : esc(games[mode].name)}</strong></div><div class="top-actions"><span class="offline">${svg('wifi',16)}Offline ready</span><button class="small-button" data-action="dataset">↥ Vocabulary</button><button class="small-button" data-action="settings" aria-label="Practice settings">⚙ Settings</button></div></header><div id="content"></div><footer class="footer"><span>WORDLAB / LEARN BY DOING</span><span>Made for curious minds. Works offline.${mode === 'index' ? ' <a class="story-link" href="story.html">Our Story</a>' : ''}</span></footer></main></div><div id="dialog-root"></div><div class="sr-only" id="announcement" role="status" aria-live="polite"></div>`;
  }
  function announce(message) { const node = $('#announcement'); if(node) node.textContent = message; }
  function home() {
    const practiced = Object.values(saved).reduce((sum, item) => sum + (item.words || 0), 0);
    $('#content').innerHTML = `<section class="hero"><div><div class="eyebrow">SMALL PARTS. BIG DISCOVERIES.</div><h1>Good words.<br><span class="accent">Great connections.</span></h1><p>Turn medical terminology into something that clicks. Three ways to play. One stronger vocabulary.</p></div><div class="hero-art" aria-label="The parts of arthroscopy: arthr, o, scopy"><div class="molecule"><span class="root">arthr</span><span class="vowel">o</span><span class="suffix">scopy</span></div><div class="art-note">JOINT + CONNECTOR + VIEWING</div></div></section>
    <section class="launch-setup" aria-label="Set up your practice"><fieldset><legend>Choose your terminology sets</legend><p class="help-line">Combine any of the 12 sets, then choose a game below.</p><div class="set-checklist">${C.sets.map(set => `<label class="set-option"><input type="checkbox" data-set="${set.id}" ${selectedSets.includes(set.id) ? 'checked' : ''}>Set ${set.id}</label>`).join('')}</div><div class="set-actions"><button class="small-button" data-action="select-all-sets">Select all</button><button class="small-button" data-action="clear-sets">Clear selection</button></div><p id="set-summary" class="help-line" role="status" aria-live="polite">${esc(launcherSummary())}</p></fieldset><fieldset><legend>Word Surgeon difficulty</legend><p class="help-line">Countdown for each post-op review question.</p><div class="difficulty-options">${Object.entries(C.difficulties).map(([level,seconds]) => `<label class="difficulty-option"><input type="radio" name="difficulty" value="${level}" ${difficulty === level ? 'checked' : ''}><span>${level[0].toUpperCase() + level.slice(1)}<small>${seconds} seconds</small></span></label>`).join('')}</div></fieldset></section>
    <section aria-label="Choose a game"><div class="section-line"><h2>Find your flow</h2><span>THREE GAMES · THREE WAYS TO LEARN</span></div><div class="games">${Object.entries(games).map(([key,g],i) => `<a class="game-card" style="--card-accent:${g.accent}" data-game-link="${key}" href="${esc(href(key))}"><span class="number">0${i+1} / ${key === 'forge' ? 'ASSEMBLE' : key === 'surgeon' ? 'EXPLORE' : 'UNLOCK'}</span><div class="card-art">${key === 'forge' ? '<span class="mini-tile">neur</span><span class="mini-tile">o</span><span class="mini-tile">logy</span>' : svg(key,75)}</div><h3>${g.name}</h3><p>${g.description}</p><div class="card-footer"><span>Start playing <span aria-hidden="true">↗</span></span><span class="pill">${g.skill}</span></div></a>`).join('')}</div></section>
    <div class="session-banner"><div><strong><span class="status-dot"></span>Your next discovery is waiting.</strong><p>${words.length} unique terms ready · ${practiced} words practiced${source ? ` · ${esc(source)}` : ''}</p>${loadMessage ? `<p>${esc(loadMessage)}</p>` : ''}</div><button class="small-button" data-action="dataset">Explore your vocabulary →</button></div>`;
    refreshLauncher();
  }
  function newSession() {
    stopTimer();
    const pool = mode === 'surgeon' ? words.filter(C.exact) : words;
    deck = C.shuffle(pool).slice(0, Number(settings.rounds) || 10);
    state = {index:0, score:0, streak:0, bestStreak:0, completed:0, skipped:0, errors:0, phase:0, clean:true, feedback:'', feedbackType:'', summary:false};
    if (deck.length) startRound(); else renderGame();
  }
  function word() { return deck[state.index]; }
  function startRound() {
    stopTimer(); selectedTile = null;
    Object.assign(state,{phase:0,clean:true,feedback:'',feedbackType:'',answer:'',cuts:[],tags:{},hint:false,pronunciationHint:false,timedOut:false,reviewIndex:0,reviewAnswered:false});
    const correct = C.parts(word());
    const other = C.shuffle(words.flatMap(C.parts)).filter(p => !correct.some(c => c.text === p.text));
    const distractors = [...new Map(other.map(p => [p.text,p])).values()].slice(0,3);
    state.tiles = C.shuffle([...correct,...distractors]).map((p,i) => ({...p,id:i,used:false}));
    state.placed = Array(correct.length).fill(null);
    state.activeSlot = 0;
    state.reviewParts = C.shuffle(correct);
    prepareChoices(); renderGame();
  }
  function prepareChoices() {
    if (!word()) return;
    const definitions = [...new Set(C.shuffle(words).map(w => w['Basic Definition']))].filter(d => d !== word()['Basic Definition']).slice(0,2);
    state.definitions = C.shuffle([word()['Basic Definition'], ...definitions]);
    const parts = C.parts(word());
    const wrongRole = parts.map((p,i) => i === 0 ? {...p,role:p.role === 'root' ? 'prefix' : 'root'} : p);
    const wrongDivision = parts.length > 1 ? [{...parts[0],text:parts[0].text + parts[1].text},...parts.slice(2)] : [{...parts[0],text:parts[0].text.slice(0,-1)}, {text:parts[0].text.slice(-1),role:'suffix'}];
    state.formulas = C.shuffle([{parts,correct:true},{parts:wrongRole,correct:false},{parts:wrongDivision,correct:false}]);
  }
  function notice(message, type='bad') { state.feedback = message; state.feedbackType = type; const node = $('#feedback'); if(node) { node.textContent = message; node.className = `feedback ${type}`; } announce(message); }
  function mistake(message) { state.clean = false; state.errors++; state.streak = 0; notice(message); }
  function feedbackHTML() { return `<div id="feedback" class="feedback ${state.feedbackType}" role="status" aria-live="polite">${esc(state.feedback)}</div>`; }
  function progressHTML() { const steps = mode === 'forge' ? 2 : mode === 'surgeon' ? 4 : 3; return `<div class="stepper" aria-label="Stage ${Math.min(state.phase+1,steps)} of ${steps}">${Array.from({length:steps},(_,i) => `<span class="${i <= state.phase ? 'done' : ''}"></span>`).join('')}</div>`; }
  function brief(showTerm=false) {
    const w = word();
    const hidePronunciation = mode === 'forge' && !state.pronunciationHint;
    return `<div class="brief"><div class="eyebrow">${showTerm ? 'TARGET TERM' : 'DEFINITION BRIEFING'}</div><h2>${esc(showTerm ? w.Term : w['Basic Definition'])}</h2><div class="phonetics">${hidePronunciation ? '<button data-action="pronunciation-hint" aria-expanded="false">Reveal pronunciation hint · 75-point round</button>' : `<span>${esc(w.Phonetics || 'No pronunciation guide supplied')}</span><button data-action="speak" aria-label="Pronounce term">◖♪</button>`}</div></div>`;
  }
  function sideHTML() {
    return `<aside class="side-stack"><section class="side-card"><h3>Your session</h3><div class="session-count"><span>${state.index} of ${deck.length} rounds</span><span>${Math.round(state.index / deck.length*100)}%</span></div><div class="progress-track"><span style="width:${state.index/deck.length*100}%"></span></div><p>${state.completed} completed · ${state.skipped} skipped<br>Best score: ${saved[mode]?.best || 0} points</p><button class="small-button" data-action="restart">New session ↻</button></section><section class="side-card"><h3>The anatomy of a word</h3><div class="legend">${Object.entries(C.roles).map(([key,value]) => `<span class="${key}"><i></i>${value}</span>`).join('')}</div></section><section class="side-card"><h3>${mode === 'forge' ? 'Make it click' : mode === 'surgeon' ? 'Your procedure' : 'The three keys'}</h3><ol>${(mode === 'forge' ? ['Tap a tile to fill the next bay.','Or select a bay, then drag a tile.','Type the whole word to finish.'] : mode === 'surgeon' ? ['Spell the term from its chart.','Cut between parts, then label.','Match each part to its meaning.'] : ['Match the correct definition.','Find the accurate word blueprint.','Spell it to unlock the vault.']).map(text => `<li>${text}</li>`).join('')}</ol><p>Enter to submit · Space to continue</p>${mode === 'surgeon' && words.some(w => !C.exact(w)) ? `<p>${words.filter(w => !C.exact(w)).length} terms have spelling changes or inconsistent parts and are excluded from exact-cut practice.</p>` : ''}${loadMessage ? `<p>${esc(loadMessage)}</p>` : ''}</section></aside>`;
  }
  function renderGame() {
    const game = games[mode];
    $('#content').innerHTML = `<header class="game-header"><div><div class="eyebrow">${game.label}</div><h1>${game.name}</h1><p>${game.subtitle}</p></div><div class="stats"><div class="stat"><strong>${state.score.toLocaleString()}</strong><span>Points</span></div><div class="stat"><strong>${state.streak}<span aria-hidden="true">×</span></strong><span>Streak</span></div></div></header>${!deck.length ? `<div class="workbench empty"><h2>No playable terms yet</h2><p class="muted">${mode === 'surgeon' ? 'This game needs terms whose parts join to the exact spelling.' : 'Load a CSV with terms, word parts, and definitions to begin.'}</p><button class="primary" data-action="dataset">Load vocabulary</button></div>` : state.summary ? summaryHTML() : `<div class="game-layout"><section class="workbench" aria-label="Game workbench"><div class="bench-top"><span>ROUND ${String(state.index+1).padStart(2,'0')} / ${String(deck.length).padStart(2,'0')}</span>${progressHTML()}</div><div id="round">${state.phase === 9 ? completeHTML() : mode === 'forge' ? forgeHTML() : mode === 'surgeon' ? surgeonHTML() : trailHTML()}</div></section>${sideHTML()}</div>`}`;
    if (state.summary || !deck.length) return;
    if (mode === 'trail' && state.phase === 2 && !state.timedOut) startCountdown(settings.timed ? 30 : 0, trailTimeout);
    if (mode === 'surgeon' && state.phase === 3 && !state.reviewAnswered) startCountdown(settings.timed ? C.difficulties[difficulty] : 0, reviewTimeout);
    if ((mode === 'forge' && state.phase === 1) || (mode === 'surgeon' && state.phase === 0) || (mode === 'trail' && state.phase === 2)) setTimeout(() => $('#spelling')?.focus({preventScroll:true}),0);
  }
  function spellField(label, placeholder='Type the full term…') {
    return `<form id="spell-form" autocomplete="off"><label class="form-label" for="spelling">${label}</label><input id="spelling" class="spell-input" value="${esc(state.answer)}" placeholder="${placeholder}" spellcheck="false" autocapitalize="none" autocorrect="off" autocomplete="off" ${state.timedOut ? 'disabled' : ''}><div class="actions"><button type="button" data-action="hint">Hint</button><button type="submit" class="primary" ${state.timedOut ? 'disabled' : ''}>${mode === 'forge' ? 'Synthesize word' : mode === 'surgeon' ? 'Confirm diagnosis' : 'Unlock vault'} →</button></div></form>`;
  }
  function toolsHTML() { return `<div class="actions"><button class="small-button" data-action="skip">Skip this word →</button><button class="small-button" data-action="glossary">Word-part guide</button></div>`; }
  function formulaHTML(parts) { return `<span class="formula">${parts.map((p,i) => `${i ? '<span class="muted">+</span>' : ''}<span class="formula-part ${p.role}"><small>${C.roles[p.role]}</small>${esc(p.text)}</span>`).join('')}</span>`; }
  function forgeHTML() {
    const parts = C.parts(word());
    return brief() + (state.phase === 0 ? `<p class="help-line">Build the term. Tap a tile, or drag it into a bay.</p><div class="slots" aria-label="Assembly bays">${parts.map((p,i) => `<button class="slot ${p.role} ${state.placed[i] !== null ? 'filled' : ''} ${state.activeSlot === i ? 'selected' : ''}" data-slot="${i}" aria-label="${C.roles[p.role]} bay ${i+1}${state.placed[i] !== null ? ': ' + state.tiles[state.placed[i]].text : ': empty'}"><span>${state.placed[i] !== null ? esc(state.tiles[state.placed[i]].text) : '+'}</span><small>${C.roles[p.role]}${p.role === 'root' ? ' ' + p.key.split('_')[1] : ''}</small></button>`).join('')}</div><div class="eyebrow">COMPONENT TRAY</div><div class="tiles">${state.tiles.map(tile => `<button class="tile ${tile.role} ${tile.used ? 'used' : ''}" data-tile="${tile.id}" title="${esc(C.meaning(tile))}" ${tile.used ? 'disabled' : ''}>${esc(tile.text)}</button>`).join('')}</div><div class="actions"><button data-action="hint">Hint</button><button data-action="reset-tiles">Clear bays ↻</button></div>` : `<div class="part-review">${parts.map(p => `<span class="${p.role}" title="${esc(C.meaning(p))}">${esc(p.text)}</span>`).join('')}</div>${!C.exact(word()) ? '<p class="help-line">These supplied parts do not join to the exact term. Use the definition and pronunciation for the final spelling; the CSV may include a spelling change or a division to review.</p>' : ''}${spellField('Fuse the parts. Spell the whole word.')}`) + feedbackHTML() + toolsHTML();
  }
  function placeTile(id, slot = state.activeSlot) {
    if (mode !== 'forge' || state.phase !== 0 || slot < 0) return;
    const tile = state.tiles[id], target = C.parts(word())[slot];
    if (!tile || tile.used || !target) return;
    if (C.normalize(tile.text) !== C.normalize(target.text) || tile.role !== target.role) {
      mistake(`Try another part. This bay needs a ${C.roles[target.role].toLowerCase()}.`); return;
    }
    if (state.placed[slot] !== null) state.tiles[state.placed[slot]].used = false;
    tile.used = true; state.placed[slot] = id;
    state.activeSlot = state.placed.findIndex(value => value === null);
    state.feedback = `${tile.text}: ${C.meaning(tile)}.`; state.feedbackType = 'good';
    if (state.activeSlot === -1) { state.phase = 1; state.feedback = 'All parts connected. Now make the spelling stick.'; }
    renderGame(); announce(state.feedback);
  }
  function surgeonHTML() {
    if (state.phase === 0) {
      const letters = [...word().Term];
      return brief() + `<div class="word-display" aria-label="Masked term">${letters.map((char,i) => i === 0 || i === letters.length-1 ? esc(char) : '·').join('')}</div>` + spellField('Confirm the term before making the first incision.') + feedbackHTML() + toolsHTML();
    }
    if (state.phase === 1) return brief(true) + `<p class="help-line">Tap the marks between letters to make or undo a cut. You can also drag across them.</p><div class="ribbon" aria-label="Word dissection ribbon">${[...word().Term].map((char,i) => `<span class="letter">${esc(char)}</span>${i < word().Term.length-1 ? `<button class="cut ${state.cuts.includes(i+1) ? 'on' : ''}" data-cut="${i+1}" aria-label="Cut after letter ${i+1}: ${esc(char)}" aria-pressed="${state.cuts.includes(i+1)}">·</button>` : ''}`).join('')}</div><div class="actions"><button data-action="hint">Hint</button><button class="primary" data-action="check-cuts">Check incisions →</button></div>` + feedbackHTML() + toolsHTML();
    if (state.phase === 2) return brief(true) + `<p class="help-line">A clean cut. Now identify the job of each part.</p>${C.parts(word()).map((part,i) => `<div class="tag-row"><strong>${esc(part.text)}</strong><label><span class="sr-only">Role of ${esc(part.text)}</span><select data-tag="${i}"><option value="">Choose a role</option>${Object.entries(C.roles).map(([key,label]) => `<option value="${key}" ${state.tags[i] === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>`).join('')}<div class="actions"><button data-action="hint">Hint</button><button class="primary" data-action="check-tags">Complete procedure →</button></div>` + feedbackHTML() + toolsHTML();
    const part = state.reviewParts[state.reviewIndex];
    if (!state.reviewChoices) {
      const meaning = C.meaning(part);
      const others = [...new Set(C.shuffle(words.flatMap(C.parts)).map(C.meaning))].filter(m => m !== meaning).slice(0,2);
      state.reviewChoices = C.shuffle([meaning,...others]);
    }
    return `<div class="section-line"><div class="eyebrow">POST-OP REVIEW · ${state.reviewIndex+1} / ${state.reviewParts.length}</div><span id="timer" class="timer" role="timer" aria-label="Time remaining">${state.reviewAnswered ? 'REVIEWED' : settings.timed ? C.difficulties[difficulty] + 's' : 'UNTIMED'}</span></div><h2>What does <span class="${part.role}">${esc(part.text)}</span> contribute?</h2><p class="help-line">${C.roles[part.role]} in ${esc(word().Term)}. ${settings.timed ? `${difficulty[0].toUpperCase() + difficulty.slice(1)} · You have ${C.difficulties[difficulty]} seconds for this part.` : 'Take your time.'}</p><div class="choices">${state.reviewChoices.map((choice,i) => `<button class="choice" data-review="${i}" ${state.reviewAnswered ? 'disabled' : ''}><span class="choice-letter">${String.fromCharCode(65+i)}</span>${esc(choice)}</button>`).join('')}</div>` + feedbackHTML() + (state.reviewAnswered ? `<div class="actions"><button class="primary" data-action="next-review">${state.reviewIndex + 1 < state.reviewParts.length ? 'Next part' : 'Finish review'} →</button></div>` : '');
  }
  function trailHTML() {
    if (state.phase === 0) return brief(true) + '<p class="help-line">Gate 1 · Find the meaning that unlocks this term.</p>' + `<div class="choices">${state.definitions.map((definition,i) => `<button class="choice" data-definition="${i}"><span class="choice-letter">${String.fromCharCode(65+i)}</span>${esc(definition)}</button>`).join('')}</div>` + feedbackHTML() + toolsHTML();
    if (state.phase === 1) return brief(true) + '<p class="help-line">Gate 2 · Which blueprint has the right parts and roles?</p>' + (!C.exact(word()) ? '<p class="help-line">Follow the supplied CSV blueprint. Its parts do not join to the exact spelling; this entry includes a spelling change or a division to review.</p>' : '') + `<div class="choices">${state.formulas.map((formula,i) => `<button class="choice" data-formula="${i}"><span class="choice-letter">${String.fromCharCode(65+i)}</span>${formulaHTML(formula.parts)}</button>`).join('')}</div>` + feedbackHTML() + toolsHTML();
    return `<div class="section-line"><div class="eyebrow">GATE 3 / THE KEYSTROKE VAULT</div><span id="timer" class="timer"></span></div><h2>One last key. Spell the word.</h2><p class="muted">${esc(word()['Basic Definition'])}</p>${spellField('Enter the term to open the vault.')}<div class="typing-progress" id="typing-progress" aria-hidden="true"></div>${keyboardHTML()}${feedbackHTML()}${state.timedOut ? '<div class="actions"><button class="primary" data-action="retry-timer">Try the vault again ↻</button></div>' : ''}${toolsHTML()}`;
  }
  function keyboardHTML() { return `<div class="keyboard" aria-label="On-screen keyboard">${['qwertyuiop','asdfghjkl','zxcvbnm'].map((row,i) => `<div class="keyboard-row">${[...row].map(letter => `<button class="key" data-key="${letter}" ${state.timedOut ? 'disabled' : ''}>${letter.toUpperCase()}</button>`).join('')}${i === 2 ? `<button class="key wide" data-key="Backspace" aria-label="Backspace" ${state.timedOut ? 'disabled' : ''}>⌫</button>` : ''}</div>`).join('')}</div>`; }
  function updateTyping() {
    const node = $('#typing-progress'); if (!node) return;
    const target = C.normalize(word().Term);
    node.innerHTML = [...state.answer.toLowerCase()].map((letter,i) => `<span class="${letter === target[i] ? 'right' : 'wrong'}">${esc(letter)}</span>`).join('');
  }
  function submitSpelling() {
    if (state.timedOut) return;
    const value = $('#spelling')?.value ?? ''; state.answer = value;
    if (!value.trim()) { notice('Type your answer first.'); return; }
    if (C.normalize(value) !== C.normalize(word().Term)) {
      mistake('Almost. Check every letter, and keep the term in one piece.');
      $('#spelling')?.classList.remove('shake'); requestAnimationFrame(() => $('#spelling')?.classList.add('shake')); return;
    }
    if (mode === 'surgeon') { state.phase = 1; state.answer = ''; state.feedback = 'Diagnosis confirmed. Find the boundaries between word parts.'; state.feedbackType = 'good'; renderGame(); }
    else finishRound();
  }
  function toggleCut(position) {
    if (state.cuts.includes(position)) state.cuts = state.cuts.filter(n => n !== position); else state.cuts.push(position);
    const button = $(`[data-cut="${position}"]`); button?.classList.toggle('on',state.cuts.includes(position)); button?.setAttribute('aria-pressed',String(state.cuts.includes(position)));
  }
  function checkCuts() {
    const expected = C.boundaries(word());
    if (expected.length !== state.cuts.length || expected.some(n => !state.cuts.includes(n))) {
      mistake('Uneven cut. Separate every prefix, root, connecting vowel, and suffix. A connecting vowel gets its own piece.'); return;
    }
    state.phase = 2; state.feedback = ''; renderGame();
  }
  function checkTags() {
    const parts = C.parts(word());
    const wrong = parts.findIndex((part,i) => state.tags[i] !== part.role);
    if (wrong !== -1) { mistake(`Check the tag for “${parts[wrong].text}”. ${C.meaning(parts[wrong])}.`); return; }
    state.phase = 3; state.reviewChoices = null; state.feedback = ''; renderGame();
  }
  function reviewTimeout() {
    state.reviewAnswered = true;
    mistake(`Time’s up. ${state.reviewParts[state.reviewIndex].text}: ${C.meaning(state.reviewParts[state.reviewIndex])}.`); renderGame();
  }
  function trailTimeout() { state.timedOut = true; mistake(`Time’s up. The term is ${word().Term}. Review it, then try the vault again.`); renderGame(); }
  function stopTimer() { if(timerId) clearInterval(timerId); timerId = null; deadline = 0; remaining = 0; timerCallback = null; }
  function pauseTimer() { if(timerId) { remaining = Math.max(0, deadline - performance.now()); clearInterval(timerId); timerId = null; } }
  function resumeTimer() { if(remaining > 0 && timerCallback && !timerId && !modal && !document.hidden) { deadline = performance.now() + remaining; timerId = setInterval(tickTimer,200); tickTimer(); } }
  function tickTimer() {
    const ms = Math.max(0,deadline-performance.now()); remaining = ms;
    const node = $('#timer'); if(node) { node.textContent = `${Math.ceil(ms/1000)}s`; node.classList.toggle('urgent',ms < 6000); }
    if (ms <= 0) { const callback = timerCallback; stopTimer(); callback?.(); }
  }
  function startCountdown(seconds, callback) {
    if (!seconds) { const node = $('#timer'); if(node) node.textContent = 'UNTIMED'; return; }
    if (timerId) { tickTimer(); return; }
    if (!timerCallback) { remaining = seconds * 1000; timerCallback = callback; }
    resumeTimer();
  }
  function hint() {
    state.clean = false; state.hint = true;
    if (mode === 'forge' && state.phase === 0) { const p = C.parts(word())[state.activeSlot]; notice(`Next bay: ${p.text} · ${C.roles[p.role]}. ${C.meaning(p)}.`, 'good'); }
    else if (mode === 'surgeon' && state.phase === 1) notice(`Try this division: ${C.parts(word()).map(p => p.text).join(' / ')}.`, 'good');
    else if (mode === 'surgeon' && state.phase === 2) notice(C.parts(word()).map(p => `${p.text}: ${C.roles[p.role]}`).join(' · '),'good');
    else notice(`Spelling cue: ${word().Term.slice(0,3)}… · ${word().Term.length} letters. ${word().Phonetics || ''}`, 'good');
  }
  function pronunciationHint() {
    if (mode !== 'forge' || !state || state.phase === 9) return;
    state.clean = false; state.hint = true; state.pronunciationHint = true;
    renderGame();
    notice('Pronunciation hint revealed. This round is worth 75 points; a clean streak starts again on the next word.', 'good');
  }
  function finishRound() {
    stopTimer();
    state.completed++; state.streak = state.clean ? state.streak+1 : 0; state.bestStreak = Math.max(state.bestStreak,state.streak);
    const earned = (state.clean ? 150 : 75) * Math.min(3,Math.max(1,state.streak)); state.score += earned; state.earned = earned; state.phase = 9; state.feedback = '';
    const stats = saved[mode] || {best:0,words:0}; stats.best = Math.max(stats.best,state.score); stats.words++; saved[mode] = stats; storage.set('stats',saved);
    renderGame(); announce(`${word().Term} complete. ${earned} points.`);
    $('.workbench')?.insertAdjacentHTML('beforeend',`<div class="confetti" aria-hidden="true">${Array.from({length:18},(_,i) => `<i style="--x:${Math.cos(i)*200}px;--y:${Math.sin(i)*180}px;--rotation:${i*23}deg;background:${['var(--accent)','var(--root)','var(--suffix)'][i%3]}"></i>`).join('')}</div>`);
    if (settings.sound) speak();
    setTimeout(() => $('[data-action="next"]')?.focus({preventScroll:true}),0);
  }
  function completeHTML() {
    const badge = state.streak >= 5 ? 'Word alchemist · 5-word streak' : state.streak >= 3 ? 'On a roll · 3-word streak' : state.clean ? 'First-try finish' : 'Practice makes progress';
    return `<div class="complete"><div class="seal" aria-hidden="true">✓</div><div class="eyebrow">${badge}</div><h2>${mode === 'forge' ? 'A word, well made.' : mode === 'surgeon' ? 'Beautifully dissected.' : 'Vault unlocked.'}</h2><p class="term">${esc(word().Term)}</p><p class="muted">${esc(word()['Basic Definition'])}</p><div class="part-review">${C.parts(word()).map(p => `<span class="${p.role}">${esc(p.text)}<small>${esc(C.meaning(p))}</small></span>`).join('')}</div><p class="accent">+${state.earned} points${state.streak > 1 ? ` · ${Math.min(3,state.streak)}× streak multiplier` : ''}</p><div class="actions"><button data-action="speak">Replay pronunciation ♪</button><button class="primary" data-action="next">${state.index+1 === deck.length ? 'See session results' : 'Next word'} →</button></div></div>`;
  }
  function nextRound(skipped=false) {
    stopTimer();
    if (skipped) { state.skipped++; state.streak = 0; }
    state.index++;
    if (state.index >= deck.length) { state.summary = true; renderGame(); return; }
    startRound();
  }
  function summaryHTML() {
    return `<section class="workbench complete"><div class="seal">✓</div><div class="eyebrow">SESSION COMPLETE</div><h2>A little wiser already.</h2><p class="muted">${state.completed} words practiced. ${state.skipped} skipped. Every connection counts.</p><div class="stats" style="justify-content:center;text-align:center;margin:35px 0"><div class="stat"><strong>${state.score}</strong><span>Total points</span></div><div class="stat"><strong>${state.bestStreak}</strong><span>Best streak</span></div><div class="stat"><strong>${state.errors}</strong><span>Corrections</span></div></div><p class="muted">${state.bestStreak >= 5 ? 'Achievement unlocked: Word alchemist — five clean rounds in a row.' : state.bestStreak >= 3 ? 'Achievement unlocked: On a roll — three clean rounds in a row.' : 'Build a streak of three clean rounds to earn your first achievement.'}</p><div class="actions" style="justify-content:center"><a class="pill" href="${esc(href('index'))}">← All games</a><button class="primary" style="margin-left:0" data-action="restart">Play another session ↻</button></div></section>`;
  }
  function speak() {
    if (mode === 'forge' && state?.phase !== 9 && !state?.pronunciationHint) pronunciationHint();
    if (!('speechSynthesis' in window)) { announce('Speech is unavailable. Use the written pronunciation guide.'); if(state) notice('Use the written pronunciation guide; speech is unavailable in this browser.','good'); return; }
    const voices = speechSynthesis.getVoices();
    const localVoice = voices.find(v => v.localService && v.lang.startsWith('en'));
    if (!localVoice) { if(state) notice('No offline English voice is installed. Use the written pronunciation guide.','good'); return; }
    speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(word().Term); utterance.voice = localVoice; utterance.lang = localVoice.lang; utterance.rate = .8; speechSynthesis.speak(utterance);
  }
  let lastFocus;
  function openModal(kind) {
    lastFocus = document.activeElement; modal = kind; pauseTimer();
    let body = '', title = '';
    if (kind === 'dataset') {
      title = 'Your vocabulary, your practice.';
      body = `<p>Play the included sets, or bring your own CSV. Multiple files become one vocabulary pool; duplicate terms are merged.</p><div class="dataset-info"><strong>${words.length} unique terms loaded</strong><br>${esc(source)}${loadMessage ? `<br>${esc(loadMessage)}` : ''}</div><div class="dropzone" id="dropzone"><p>Drop CSV files here, or choose files below.</p><label for="csv-files" class="sr-only">Choose vocabulary CSV files</label><input id="csv-files" type="file" accept=".csv,text/csv" multiple></div><p>Required columns: Term, Basic Definition, prefix, root_1, c_vowel_1, root_2, c_vowel_2, root_3, c_vowel_3, suffix_1. Phonetics is optional. Unused parts may be blank.</p><div id="import-status" class="feedback" role="status"></div><div class="actions"><button data-action="use-included">Use included sets</button><button class="primary" data-action="close-modal">Continue →</button></div><p class="muted">Changing vocabulary starts a fresh game session. Files stay in this browser.</p>`;
    } else if (kind === 'settings') {
      title = 'Find your practice rhythm.';
      body = `<p>Adjust your next session. Turning the timer off gives you room to think.</p><div class="settings"><label for="round-count">Words per session</label><select id="round-count">${[5,10,20].map(n => `<option value="${n}" ${Number(settings.rounds) === n ? 'selected' : ''}>${n} words</option>`).join('')}</select></div><label class="settings"><input id="timed-setting" type="checkbox" ${settings.timed ? 'checked' : ''}>Timed vault and post-op review</label><label class="settings"><input id="sound-setting" type="checkbox" ${settings.sound ? 'checked' : ''}>Pronounce words after a round</label><p>Pronunciation uses an installed offline English voice, when available. In Morpheme Forge, revealing the pronunciation guide during a round counts as a hint.</p><div class="actions"><button class="primary" data-action="save-settings">Save & start fresh →</button></div>`;
    } else {
      title = 'Small parts, clearer meaning.';
      body = `<p>Meanings follow the supplied vocabulary. When a part has no individual meaning in our guide, its structural role is shown.</p>${C.parts(word()).map(p => `<div class="glossary-item"><strong class="${p.role}">${esc(p.text)}</strong> · ${C.roles[p.role]}<br><span>${esc(C.meaning(p))}</span></div>`).join('')}<div class="actions"><button class="primary" data-action="close-modal">Back to practice →</button></div>`;
    }
    $('#dialog-root').innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div class="modal-head"><h2 id="dialog-title">${title}</h2><button data-action="close-modal" aria-label="Close dialog">✕</button></div>${body}</section></div>`;
    $('.modal button')?.focus();
  }
  function closeModal() { modal = null; $('#dialog-root').innerHTML = ''; lastFocus?.isConnected && lastFocus.focus(); resumeTimer(); }
  function rememberImport() { try { sessionStorage.setItem('wordlab:import',JSON.stringify({words,source,loadMessage})); } catch { loadMessage += ' This browser cannot carry imported data between game pages; import it again if needed.'; } }
  function applyVocabulary(records, label, message='', isImport=false) {
    words = C.merge(records); source = label; loadMessage = message; imported = isImport;
    if(isImport) rememberImport();
    closeModal(); shell(); if(mode === 'index') home(); else newSession();
  }
  async function importFiles(files) {
    const status = $('#import-status');
    try {
      if (!files.length) return;
      const results = await Promise.all([...files].map(async file => ({name:file.name,...C.parseCSV(await file.text())})));
      const all = results.flatMap(r => r.records);
      if(!all.length) throw new Error('No usable vocabulary rows found. Check required fields.');
      const skipped = results.reduce((sum,r) => sum+r.skipped,0);
      applyVocabulary(all,results.map(r => r.name).join(', '),skipped ? `${skipped} invalid rows skipped.` : '',true);
      announce(`Loaded ${words.length} vocabulary terms.`);
    } catch(error) { if(status) {status.textContent = error.message; status.className = 'feedback bad';} }
  }
  async function readURL(file) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(),5000);
    try {
      const response = await fetch(file,{signal:controller.signal}); if(!response.ok) throw new Error(`HTTP ${response.status}`); return await response.text();
    } catch {
      return await new Promise((resolve,reject) => { const xhr = new XMLHttpRequest(); xhr.open('GET',file); xhr.timeout = 5000; xhr.onload = () => (xhr.status === 200 || xhr.status === 0) && xhr.responseText ? resolve(xhr.responseText) : reject(new Error('Could not load file')); xhr.onerror = xhr.ontimeout = () => reject(new Error('Could not load file')); xhr.send(); });
    } finally { clearTimeout(timeout); }
  }
  async function initialize() {
    shell(); $('#content').innerHTML = '<div class="empty"><h2>Opening the word workshop…</h2><p class="muted">Loading your vocabulary.</p></div>';
    try {
      if (requestedSets && (!requestedSets.length || requestedSets.some(id => !C.sets.some(s => String(s.id) === id)))) throw new Error('Choose at least one valid terminology set (1–12) on the title screen.');
      if ((!params.has('db_file') && !params.has('sets')) || params.get('use_import') === '1') {
        try { const cached = JSON.parse(sessionStorage.getItem('wordlab:import')); if(cached?.words?.length) { applyVocabulary(cached.words,cached.source,cached.loadMessage,true); return; } } catch { /* Fall through to included data. */ }
      }
      const files = params.has('sets') ? C.sets.filter(s => selectedSets.includes(s.id)).map(s => s.file)
        : params.has('db_file') ? requestedFiles : C.sets.map(s => s.file);
      if (!files.length) throw new Error('No database filename was supplied. Choose a CSV file.');
      const results = await Promise.allSettled(files.map(async file => {
        try { return {name:file,...C.parseCSV(await readURL(file))}; }
        catch (error) {
          if (Object.hasOwn(embeddedSets,file)) return {name:file,...C.parseCSV(embeddedSets[file])};
          throw error;
        }
      }));
      const loaded = results.filter(r => r.status === 'fulfilled').map(r => r.value);
      const records = loaded.flatMap(r => r.records), skipped = loaded.reduce((sum,r) => sum+r.skipped,0);
      if (records.length) {
        const failed = files.filter((f,i) => results[i].status === 'rejected');
        applyVocabulary(records,loaded.map(r => r.name).join(', '),[failed.length ? `Not loaded: ${failed.join(', ')}. Import them using Vocabulary.` : '',skipped ? `${skipped} invalid rows skipped.` : ''].filter(Boolean).join(' '));
      } else {
        applyVocabulary([],'No CSV loaded', 'The requested CSV files could not be read. Choose them below, or use the included sets.'); openModal('dataset');
      }
    } catch(error) { applyVocabulary([],'No CSV loaded',error.message); openModal('dataset'); }
  }
  document.addEventListener('click', event => {
    if (drag?.moved) return;
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    if(button.dataset.tile !== undefined) { placeTile(Number(button.dataset.tile)); return; }
    if(button.dataset.slot !== undefined) { state.activeSlot = Number(button.dataset.slot); renderGame(); return; }
    if(button.dataset.cut !== undefined) { toggleCut(Number(button.dataset.cut)); return; }
    if(button.dataset.definition !== undefined) {
      if(state.definitions[Number(button.dataset.definition)] === word()['Basic Definition']) { state.phase = 1; state.feedback = 'Meaning decoded. Find the structure.'; state.feedbackType = 'good'; renderGame(); }
      else { button.classList.add('wrong'); mistake('That definition belongs to a different term. Try another meaning.'); } return;
    }
    if(button.dataset.formula !== undefined) {
      if(state.formulas[Number(button.dataset.formula)].correct) { state.phase = 2; state.feedback = ''; state.answer = ''; renderGame(); }
      else { button.classList.add('wrong'); mistake('Check both the boundaries and the labels. A connecting vowel is separate from the root.'); } return;
    }
    if(button.dataset.review !== undefined) {
      const correct = state.reviewChoices[Number(button.dataset.review)] === C.meaning(state.reviewParts[state.reviewIndex]);
      stopTimer(); state.reviewAnswered = true;
      if(correct) { state.feedback = 'Exactly. Another connection made.'; state.feedbackType = 'good'; }
      else mistake(`${state.reviewParts[state.reviewIndex].text}: ${C.meaning(state.reviewParts[state.reviewIndex])}.`);
      renderGame(); return;
    }
    if(button.dataset.key !== undefined) {
      if(state.timedOut) return;
      const input = $('#spelling'); if(!input) return;
      const start = input.selectionStart ?? input.value.length, end = input.selectionEnd ?? start;
      const back = button.dataset.key === 'Backspace';
      const left = back && start === end ? Math.max(0,start-1) : start;
      input.setRangeText(back ? '' : button.dataset.key,left,end,'end'); state.answer = input.value; updateTyping(); input.focus(); return;
    }
    const action = button.dataset.action;
    if (['dataset','settings','glossary'].includes(action)) { openModal(action); return; }
    if(action === 'close-modal') closeModal();
    else if(action === 'use-included') {
      try {sessionStorage.removeItem('wordlab:import');} catch {}
      if (!selectedSets.length) selectedSets = C.sets.map(s => s.id);
      launcherOverrides = true;
      applyVocabulary(includedRecords(C.sets.filter(s => selectedSets.includes(s.id)).map(s => s.file)),`Medical terminology · Sets ${selectedSets.join(', ')}`);
    }
    else if(action === 'select-all-sets' || action === 'clear-sets') {
      selectedSets = action === 'select-all-sets' ? C.sets.map(s => s.id) : [];
      launcherOverrides = true; imported = false;
      document.querySelectorAll('[data-set]').forEach(input => input.checked = selectedSets.includes(Number(input.dataset.set)));
      refreshLauncher();
    }
    else if(action === 'save-settings') { settings = {rounds:Number($('#round-count').value),timed:$('#timed-setting').checked,sound:$('#sound-setting').checked}; storage.set('settings',settings); closeModal(); if(mode !== 'index') newSession(); }
    else if(action === 'restart') newSession();
    else if(action === 'hint') hint();
    else if(action === 'pronunciation-hint') pronunciationHint();
    else if(action === 'speak') speak();
    else if(action === 'skip') nextRound(true);
    else if(action === 'next') nextRound();
    else if(action === 'check-cuts') checkCuts();
    else if(action === 'check-tags') checkTags();
    else if(action === 'next-review') { stopTimer(); if(++state.reviewIndex >= state.reviewParts.length) finishRound(); else {state.reviewChoices = null; state.reviewAnswered = false; state.feedback = ''; renderGame();} }
    else if(action === 'retry-timer') { state.timedOut = false; state.answer = ''; state.feedback = ''; renderGame(); }
    else if(action === 'reset-tiles') { state.tiles.forEach(t => t.used = false); state.placed.fill(null); state.activeSlot = 0; state.feedback = ''; renderGame(); }
  });
  document.addEventListener('submit',event => { if(event.target.id === 'spell-form') {event.preventDefault(); submitSpelling();} });
  document.addEventListener('input',event => { if(event.target.id === 'spelling') {state.answer = event.target.value; if(mode === 'trail') updateTyping();} });
  document.addEventListener('change',event => {
    if(event.target.dataset.set !== undefined) {
      const id = Number(event.target.dataset.set);
      selectedSets = C.sets.filter(s => s.id === id ? event.target.checked : selectedSets.includes(s.id)).map(s => s.id);
      launcherOverrides = true; imported = false; refreshLauncher();
    }
    if(event.target.name === 'difficulty') { difficulty = event.target.value; refreshLauncher(); }
    if(event.target.dataset.tag !== undefined) state.tags[event.target.dataset.tag] = event.target.value;
    if(event.target.id === 'csv-files') importFiles(event.target.files);
  });
  document.addEventListener('keydown',event => {
    if(modal) {
      if(event.key === 'Escape') {event.preventDefault(); closeModal();}
      if(event.key === 'Tab') { const nodes = [...$('.modal').querySelectorAll('button,input,select,a[href]')].filter(n => !n.disabled); const first = nodes[0], last = nodes[nodes.length-1]; if(event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if(!event.shiftKey && document.activeElement === last) {event.preventDefault(); first.focus();} } return;
    }
    if(event.key === ' ' && state?.phase === 9 && !event.target.matches('button,input,select,a')) {event.preventDefault(); nextRound();}
  });
  document.addEventListener('dragover',event => { if(event.target.closest('#dropzone')) {event.preventDefault(); $('#dropzone').classList.add('over');} });
  document.addEventListener('dragleave',event => { if(event.target.closest('#dropzone')) $('#dropzone').classList.remove('over'); });
  document.addEventListener('drop',event => {if(event.target.closest('#dropzone')) {event.preventDefault(); importFiles(event.dataTransfer.files);} });
  document.addEventListener('pointerdown',event => {
    if(event.button !== 0) return;
    const tile = event.target.closest('[data-tile]'), cut = event.target.closest('[data-cut]');
    if(tile && !tile.disabled) { selectedTile = Number(tile.dataset.tile); drag = {kind:'tile',x:event.clientX,y:event.clientY,moved:false}; tile.setPointerCapture(event.pointerId); }
    else if(cut) {drag = {kind:'cut',visited:new Set([cut.dataset.cut]),x:event.clientX,y:event.clientY,moved:false}; cut.setPointerCapture(event.pointerId);}
  });
  document.addEventListener('pointermove',event => {
    if(!drag) return;
    if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>8) drag.moved = true;
    if(!drag.moved) return;
    if(drag.kind === 'tile') $(`[data-tile="${selectedTile}"]`)?.classList.add('selected');
    else { const cut = document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-cut]'); if(cut && !drag.visited.has(cut.dataset.cut)) { if(drag.visited.size === 1) toggleCut(Number([...drag.visited][0])); drag.visited.add(cut.dataset.cut); toggleCut(Number(cut.dataset.cut)); } }
  });
  document.addEventListener('pointerup',event => {
    if(!drag) return;
    if(drag.moved && drag.kind === 'tile') {const slot = document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-slot]'); if(slot) placeTile(selectedTile,Number(slot.dataset.slot)); else $(`[data-tile="${selectedTile}"]`)?.classList.remove('selected');}
    setTimeout(() => {drag = null; selectedTile = null;},0);
  });
  document.addEventListener('pointercancel',() => {drag = null; selectedTile = null; $('.tile.selected')?.classList.remove('selected');});
  document.addEventListener('visibilitychange',() => {if(document.hidden) pauseTimer(); else resumeTimer();});
  initialize();
})();
