// Standard-library tests. Run with `node tests/check.mjs`.
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';

export async function run(root = new URL('../', import.meta.url)) {
  const read = name => readFile(new URL(name, root), 'utf8');
  const core = await read('src/core.js');
  const app = await read('src/app.js');
  new vm.Script(core); new vm.Script(app);
  const isolated = vm.createContext({}); vm.runInContext(core, isolated);
  const C = isolated.WordLabCore;
  const csv = await read('words.csv');
  const setCSVs = Object.fromEntries(await Promise.all(Array.from({length:12}, async (_,i) => { const file = `medical_terminology_set${String(i+1).padStart(2,'0')}.csv`; return [file,await read(file)]; })));
  const {records,skipped} = C.parseCSV(csv);
  assert.equal(records.length,835); assert.equal(skipped,0);
  assert.equal(C.merge(records).length,790);
  assert.equal(C.merge(records).filter(C.exact).length,774);
  assert.equal(C.parts(records.find(w => w.Term === 'Humeroradioulnar')).length,6);

  const header = 'Term,Phonetics,prefix,root_1,c_vowel_1,root_2,c_vowel_2,root_3,c_vowel_3,suffix_1,Basic Definition';
  const complex = '\uFEFF' + header + '\r\nTest,"say ""test""",,test,,,,,,,"First line, with a comma\nSecond line"\r\n' + header + '\r\n';
  const parsed = C.parseCSV(complex);
  assert.equal(parsed.records.length,1);
  assert.equal(parsed.records[0].Phonetics,'say "test"');
  assert.equal(parsed.records[0]['Basic Definition'],'First line, with a comma\nSecond line');
  assert.throws(() => C.parseCSV(header + '\n"unclosed'), /not closed/);
  assert.throws(() => C.parseCSV('Term,Meaning\nA,B'), /Missing column/);
  assert.equal(C.parseCSV(header + '\nshort,row').skipped,1);
  assert.equal(C.parseCSV(header + '\nIncomplete,,,,,,,,,,').skipped,1);
  assert.equal(C.parseCSV(header + '\nApnea,,a,,,,,,,pnea,Without breathing').records.length,1);
  assert.equal(C.normalize(' Cardiac '),'cardiac');
  assert.deepEqual(Array.from(C.boundaries(records.find(w => w.Term === 'Arthroscopy'))),[5,6]);
  assert.equal(new Set(C.shuffle([1,2,3,4])).size,4);
  const anterior = records.find(w => w.Term === 'Anterior');
  assert.equal(C.parts(anterior).at(-1).key,'suffix_2');
  assert.equal(C.exact(anterior),true,'Both suffixes contribute to spelling and incision boundaries');
  assert.deepEqual(Array.from(C.boundaries(anterior)),[5,6]);

  for (const name of ['index','forge','surgeon','trail']) {
    const html = await read(`${name}.html`);
    assert.ok(html.includes(`data-game="${name}"`));
    assert.ok(html.includes(core) && html.includes(app),`${name}: source is up to date`);
    assert.ok(!/<(?:script|link)\b[^>]+(?:src|href)=/i.test(html),'No external assets');
    const embedded = html.match(/<script id="embedded-csv" type="application\/json">([\s\S]*?)<\/script>/)[1];
    assert.equal(C.parseCSV(JSON.parse(embedded)).records.length,835);
    const sets = JSON.parse(html.match(/<script id="embedded-sets" type="application\/json">([\s\S]*?)<\/script>/)[1]);
    assert.equal(Object.keys(sets).length,12);
    for (const [file,text] of Object.entries(sets)) assert.equal(text,setCSVs[file].replace(/^\uFEFF/,'').replace(/\r\n/g,'\n'));
  }

  // Test game transitions against a minimal DOM adapter. This is logic QA, not browser/layout QA.
  function harness(mode, search='') {
    const nodes = new Map(), events = {}, local = new Map(), session = new Map();
    let xhrText = null;
    const node = key => {
      if(!nodes.has(key)) nodes.set(key,{innerHTML:'',textContent:'',value:'',isConnected:true,style:{setProperty(){}},classList:{add(){},remove(){},toggle(){}},setAttribute(name,value){this[name]=value;},removeAttribute(name){delete this[name];},focus(){},insertAdjacentHTML(){}});
      return nodes.get(key);
    };
    node('#embedded-csv').textContent = JSON.stringify(csv);
    node('#embedded-sets').textContent = JSON.stringify(setCSVs);
    const links = ['nav-forge','nav-surgeon','nav-trail','forge','surgeon','trail'].map(key => Object.assign(node(key),{dataset:{gameLink:key.replace('nav-','')}}));
    const checkboxes = Array.from({length:12},(_,i) => Object.assign(node(`set-${i+1}`),{dataset:{set:String(i+1)},checked:true}));
    let clock = 0;
    const context = vm.createContext({
      URLSearchParams, AbortController, XMLHttpRequest:class {
        open(method,url) { this.url = url; }
        send() { if(xhrText !== null) {this.status = 0; this.responseText = xhrText; this.onload();} else this.onerror(); }
      },
      document:{body:{dataset:{game:mode}},documentElement:node('html'),querySelector:node,querySelectorAll:selector => selector === '[data-game-link]' ? links : selector === '[data-set]' ? checkboxes : [],addEventListener:(name,handler) => events[name] = handler,hidden:false,activeElement:null},
      location:{search}, localStorage:{getItem:key => local.get(key) ?? null,setItem:(key,value) => local.set(key,value)},
      sessionStorage:{getItem:key => session.get(key) ?? null,setItem:(key,value) => session.set(key,value),removeItem:key => session.delete(key)},
      setTimeout:() => 1,clearTimeout(){},setInterval:() => 1,clearInterval(){},requestAnimationFrame:fn => fn(),performance:{now:() => clock},
      fetch:async () => ({ok:true,text:async () => csv}),window:{}
    });
    vm.runInContext(core,context);
    const instrumented = app.replace(/  initialize\(\);\s*\}\)\(\);\s*$/, `  globalThis.test = {C,href,renderGame,pronunciationHint,applyVocabulary,newSession,startRound,placeTile,submitSpelling,checkCuts,checkTags,finishRound,nextRound,hint,startCountdown,tickTimer,stopTimer,openModal,closeModal,initialize,importFiles,settings,get selectedSets(){return selectedSets},get difficulty(){return difficulty},get state(){return state},get word(){return word()},get words(){return words},get source(){return source},get sourceMessage(){return loadMessage},get deck(){return deck},get modal(){return modal},get remaining(){return remaining},get imported(){return imported},setFetch(fn){fetch=fn}};\n})();`);
    vm.runInContext(instrumented,context);
    const api = context.test;
    assert.ok(api,'Test instrumentation applied');
    return {api,node,events,links,checkboxes,context,advance:ms => clock+=ms,setXHR:text => xhrText=text};
  }
  const click = (h,dataset) => h.events.click({target:{closest:() => ({dataset,disabled:false,classList:{add(){}}})}});
  for (const mode of ['forge','surgeon','trail']) {
    const h = harness(mode); const {api,node} = h;
    api.settings.timed = false;
    api.applyVocabulary(records,'Test CSV');
    assert.equal(api.deck.length,10);
    assert.equal(api.state.phase,0);
    assert.ok(node('#content').innerHTML.includes('workbench'));
    if(mode === 'forge') {
      const target = api.C.parts(api.word)[0];
      const wrong = api.state.tiles.find(t => t.text !== target.text);
      api.placeTile(wrong.id);
      assert.equal(api.state.errors,1);
      for(const [slot,part] of api.C.parts(api.word).entries()) {
        const tile = api.state.tiles.find(t => !t.used && t.text === part.text && t.role === part.role);
        api.placeTile(tile.id,slot);
      }
      assert.equal(api.state.phase,1);
      node('#spelling').value = 'wrong spelling'; api.submitSpelling(); assert.equal(api.state.phase,1);
      node('#spelling').value = api.word.Term.toUpperCase(); api.submitSpelling(); assert.equal(api.state.phase,9);
    } else if(mode === 'surgeon') {
      assert.ok(api.deck.every(api.C.exact));
      node('#spelling').value = api.word.Term; api.submitSpelling(); assert.equal(api.state.phase,1);
      api.state.cuts = [999]; api.checkCuts(); assert.equal(api.state.phase,1);
      api.state.cuts = api.C.boundaries(api.word); api.checkCuts(); assert.equal(api.state.phase,2);
      api.checkTags(); assert.equal(api.state.phase,2);
      api.C.parts(api.word).forEach((p,i) => api.state.tags[i] = p.role);
      api.checkTags(); assert.equal(api.state.phase,3);
      const count = api.state.reviewParts.length;
      for(let i=0;i<count;i++) {
        const index = api.state.reviewChoices.indexOf(api.C.meaning(api.state.reviewParts[api.state.reviewIndex]));
        click(h,{review:String(index)}); assert.equal(api.state.reviewAnswered,true);
        click(h,{action:'next-review'});
      }
      assert.equal(api.state.phase,9);
    } else {
      const correct = api.state.definitions.indexOf(api.word['Basic Definition']);
      const wrong = api.state.definitions.findIndex(d => d !== api.word['Basic Definition']);
      click(h,{definition:String(wrong)}); assert.equal(api.state.phase,0);
      click(h,{definition:String(correct)}); assert.equal(api.state.phase,1);
      click(h,{formula:String(api.state.formulas.findIndex(f => f.correct))}); assert.equal(api.state.phase,2);
      node('#spelling').value = api.word.Term; api.submitSpelling(); assert.equal(api.state.phase,9);
    }
    assert.equal(api.state.completed,1); assert.equal(api.state.score,75);
    api.nextRound(); assert.equal(api.state.index,1); assert.equal(api.state.phase,0);
    while(!api.state.summary) api.nextRound(true);
    assert.equal(api.state.skipped,9); assert.ok(node('#content').innerHTML.includes('SESSION COMPLETE'));
    api.newSession(); assert.equal(api.state.score,0); assert.equal(api.state.completed,0);
  }

  const timed = harness('trail'); timed.api.applyVocabulary(records,'Timer test');
  click(timed,{definition:String(timed.api.state.definitions.indexOf(timed.api.word['Basic Definition']))});
  click(timed,{formula:String(timed.api.state.formulas.findIndex(f => f.correct))});
  timed.advance(12000); timed.api.openModal('settings');
  assert.ok(timed.api.remaining <= 18000 && timed.api.remaining > 0);
  timed.advance(90000); timed.api.closeModal();
  assert.equal(timed.api.state.timedOut,false,'Opening a dialog pauses the timer');
  timed.advance(31000); timed.api.tickTimer(); assert.equal(timed.api.state.timedOut,true);
  click(timed,{action:'retry-timer'}); assert.equal(timed.api.state.timedOut,false);

  const load = harness('index','?db_file=one.csv,two.csv');
  load.api.setFetch(async file => {if(file === 'two.csv') throw new Error('Unavailable'); return {ok:true,text:async () => csv};});
  await load.api.initialize(); assert.equal(load.api.words.length,790); assert.ok(load.api.sourceMessage.includes('two.csv'));
  const imported = harness('forge');
  await imported.api.importFiles([{name:'first.csv',text:async () => csv},{name:'second.csv',text:async () => csv}]);
  assert.equal(imported.api.words.length,790); assert.equal(imported.api.imported,true);
  const before = imported.api.words.length;
  await imported.api.importFiles([{name:'bad.csv',text:async () => 'Term,Meaning\nX,Y'}]);
  assert.equal(imported.api.words.length,before,'Invalid imports preserve the current vocabulary');
  const missing = harness('index','?db_file=missing.csv'); missing.api.setFetch(async () => ({ok:true,text:async () => 'invalid'}));
  await missing.api.initialize(); assert.equal(missing.api.modal,'dataset'); assert.equal(missing.api.words.length,0);
  const offline = harness('index'); offline.api.setFetch(async () => ({ok:true,text:async () => 'invalid'}));
  await offline.api.initialize(); assert.equal(offline.api.words.length,790,'Default database failure uses embedded CSV');
  const xhr = harness('index','?db_file=local.csv'); xhr.api.setFetch(async () => {throw new Error('Local fetch blocked');}); xhr.setXHR(csv);
  await xhr.api.initialize(); assert.equal(xhr.api.words.length,790); assert.equal(xhr.api.source,'local.csv');
  const clean = harness('forge'); clean.api.applyVocabulary(records,'Scoring test');
  for(let i=0;i<4;i++) {clean.api.finishRound(); if(i<3) clean.api.nextRound();}
  assert.equal(clean.api.state.score,1350); assert.equal(clean.api.state.streak,4);
  clean.api.nextRound(); clean.api.hint(); clean.api.finishRound();
  assert.equal(clean.api.state.score,1425); assert.equal(clean.api.state.streak,0);
  const pronunciation = harness('forge'); pronunciation.api.applyVocabulary(records,'Pronunciation test');
  assert.ok(!pronunciation.node('#content').innerHTML.includes(pronunciation.api.word.Phonetics));
  assert.ok(pronunciation.node('#content').innerHTML.includes('Reveal pronunciation hint'));
  pronunciation.events.input({target:{id:'spelling',value:'partial answer'}});
  click(pronunciation,{action:'pronunciation-hint'});
  assert.equal(pronunciation.api.state.clean,false);
  assert.equal(pronunciation.api.state.answer,'partial answer');
  assert.ok(pronunciation.node('#content').innerHTML.includes('data-action="speak"'));
  pronunciation.api.renderGame(); assert.equal(pronunciation.api.state.pronunciationHint,true);
  pronunciation.api.finishRound(); assert.equal(pronunciation.api.state.score,75);
  click(pronunciation,{action:'speak'}); assert.equal(pronunciation.api.state.score,75);
  pronunciation.api.nextRound(); assert.equal(pronunciation.api.state.pronunciationHint,false);
  assert.ok(pronunciation.node('#content').innerHTML.includes('Reveal pronunciation hint'));
  pronunciation.api.finishRound(); assert.equal(pronunciation.api.state.score,225);

  for (const [level,seconds] of Object.entries({easy:20,medium:15,hard:10})) {
    const h = harness('surgeon',`?difficulty=${level}`);
    h.api.applyVocabulary([anterior],'Countdown test');
    h.node('#spelling').value = h.api.word.Term; h.api.submitSpelling();
    h.api.state.cuts = h.api.C.boundaries(h.api.word); h.api.checkCuts();
    h.api.C.parts(h.api.word).forEach((p,i) => h.api.state.tags[i] = p.role);
    h.api.checkTags();
    assert.equal(h.node('#timer').textContent,`${seconds}s`);
    assert.ok(h.node('#content').innerHTML.includes(`You have ${seconds} seconds`));
    h.advance(1100); h.api.renderGame(); assert.equal(h.node('#timer').textContent,`${seconds-1}s`,'Rendering preserves countdown');
    h.context.document.hidden = true; h.events.visibilitychange();
    h.advance(60000); h.context.document.hidden = false; h.events.visibilitychange();
    assert.equal(h.node('#timer').textContent,`${seconds-1}s`,'Hidden tabs pause countdown');
    h.api.openModal('settings'); h.advance(60000); h.api.closeModal();
    assert.equal(h.api.state.reviewAnswered,false,'Dialogs pause the Surgeon timer');
    const correct = h.api.state.reviewChoices.indexOf(h.api.C.meaning(h.api.state.reviewParts[0]));
    click(h,{review:String(correct)}); click(h,{action:'next-review'});
    assert.equal(h.node('#timer').textContent,`${seconds}s`,'Every part starts a new countdown');
    h.advance(seconds*1000+100); h.api.tickTimer();
    assert.equal(h.api.state.reviewAnswered,true); assert.equal(h.api.state.clean,false);
  }
  const untimed = harness('surgeon'); untimed.api.settings.timed = false;
  untimed.api.applyVocabulary([anterior],'Untimed review');
  untimed.api.state.phase = 3; untimed.api.renderGame();
  assert.equal(untimed.node('#timer').textContent,'UNTIMED');
  assert.equal(harness('surgeon','?difficulty=unknown').api.difficulty,'medium');

  const launcher = harness('index'); await launcher.api.initialize();
  assert.equal(launcher.checkboxes.length,12);
  assert.equal(launcher.api.selectedSets.length,12);
  click(launcher,{action:'clear-sets'});
  assert.ok(launcher.links.every(link => link['aria-disabled'] === 'true' && !link.href));
  assert.ok(launcher.node('#set-summary').textContent.includes('Select at least one'));
  for (const id of [1,12]) launcher.events.change({target:{dataset:{set:String(id)},checked:true}});
  launcher.events.change({target:{dataset:{},name:'difficulty',value:'hard'}});
  for (const link of launcher.links) {
    const query = new URLSearchParams(link.href.split('?')[1]);
    assert.equal(query.get('sets'),'1,12'); assert.equal(query.get('difficulty'),'hard');
    assert.equal(query.get('db_file'),'medical_terminology_set01.csv,medical_terminology_set12.csv');
    assert.equal(link['aria-disabled'],undefined);
  }
  click(launcher,{action:'select-all-sets'}); assert.equal(launcher.api.selectedSets.length,12);
  const expected = C.merge([1,12].flatMap(n => C.parseCSV(setCSVs[`medical_terminology_set${String(n).padStart(2,'0')}.csv`]).records));
  for (const mode of ['forge','surgeon','trail']) {
    const selected = harness(mode,'?sets=1,12&difficulty=easy');
    selected.api.setFetch(async () => {throw new Error('Blocked under file://');});
    await selected.api.initialize();
    assert.deepEqual(Array.from(selected.api.words,w => w.Term),Array.from(expected,w => w.Term),'Offline selection loads only requested sets');
    assert.ok(!selected.api.source.includes('set02'));
  }
  const restored = harness('index','?sets=1,12&difficulty=hard'); await restored.api.initialize();
  assert.deepEqual(Array.from(restored.api.selectedSets),[1,12]); assert.equal(restored.api.difficulty,'hard');
  for (const search of ['?sets=','?sets=0','?sets=13','?sets=1,bad']) {
    const invalid = harness('forge',search); await invalid.api.initialize();
    assert.equal(invalid.api.words.length,0); assert.equal(invalid.api.modal,'dataset');
  }
  const canonical = harness('forge','?db_file=medical_terminology_set03.csv');
  canonical.api.setFetch(async () => {throw new Error('Offline');}); await canonical.api.initialize();
  assert.equal(canonical.api.words.length,C.merge(C.parseCSV(setCSVs['medical_terminology_set03.csv']).records).length);
  return 'Passed: CSV edge cases, dataset integrity, standalone output, three complete game flows, scoring, sessions, timer pause/expiry/retry, multi-file loading, imports, and offline fallback.';
}

console.log(await run());
