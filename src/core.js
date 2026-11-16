/* Pure CSV and vocabulary helpers, shared by every generated standalone page. */
globalThis.WordLabCore = (() => {
  const columns = ['prefix', 'root_1', 'c_vowel_1', 'root_2', 'c_vowel_2', 'root_3', 'c_vowel_3', 'suffix_1', 'suffix_2'];
  const sets = Array.from({length:12}, (_,i) => ({id:i+1, file:`medical_terminology_set${String(i+1).padStart(2,'0')}.csv`}));
  const difficulties = {easy:20, medium:15, hard:10};
  const roles = {prefix: 'Prefix', root: 'Root', vowel: 'Connecting vowel', suffix: 'Suffix'};
  const roleOf = key => key.startsWith('c_vowel') ? 'vowel' : key.split('_')[0];
  const normalize = value => value.normalize('NFC').trim().toLowerCase();
  const parts = word => columns.filter(key => word[key]).map(key => ({key, text: word[key], role: roleOf(key)}));
  function parseCSV(text) {
    const rows = []; let row = [], field = '', quoted = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') { field += '"'; i++; }
        else if (quoted || !field) quoted = !quoted;
        else field += char;
      } else if (char === ',' && !quoted) { row.push(field); field = ''; }
      else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && text[i + 1] === '\n') i++;
        row.push(field); if (row.some(x => x.trim())) rows.push(row); row = []; field = '';
      } else field += char;
    }
    if (quoted) throw new Error('A quoted field is not closed. Check the CSV formatting.');
    row.push(field); if (row.some(x => x.trim())) rows.push(row);
    if (!rows.length) throw new Error('This CSV is empty.');
    const headers = rows.shift().map(x => x.trim());
    for (const key of ['Term', 'Basic Definition', ...columns.filter(key => key !== 'suffix_2')]) {
      if (!headers.includes(key)) throw new Error(`Missing column: ${key}.`);
    }
    let skipped = 0;
    const records = rows.flatMap(values => {
      if (values.length !== headers.length) { skipped++; return []; }
      if (values[headers.indexOf('Term')].trim() === 'Term') return [];
      const record = Object.fromEntries(headers.map((key, i) => [key, values[i].trim()]));
      // Some supplied words have a prefix and suffix but no root (e.g. apnea).
      if (!record.Term || !record['Basic Definition'] || !parts(record).length) { skipped++; return []; }
      return [record];
    });
    return {records, skipped};
  }
  function merge(records) {
    return [...new Map(records.map(word => [normalize(word.Term), word])).values()];
  }
  function shuffle(values) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
    return result;
  }
  const exact = word => normalize(parts(word).map(p => p.text).join('')) === normalize(word.Term);
  const boundaries = word => { let sum = 0; return parts(word).slice(0, -1).map(p => (sum += p.text.length)); };
  // Meanings drawn from the supplied CSV; unknown parts receive a role explanation.
  const meanings = {ab: 'away', ad: 'toward', ante: 'before', anti: 'against', a: 'without', bi: 'two', tri: 'three', circum: 'around', dia: 'between', dys: 'poor or bad', endo: 'within', epi: 'upon', ex: 'out', hyper: 'excess', hypo: 'under or low', infra: 'below', inter: 'between', intra: 'within', meta: 'beyond or after', peri: 'around', semi: 'partial', supra: 'above', tachy: 'fast', brady: 'slow', hemi: 'half', re: 'again', arthr: 'joint', chondr: 'cartilage', oste: 'bone', ost: 'bone', cardi: 'heart', card: 'heart', my: 'muscle', myos: 'muscle', neur: 'nerve', cost: 'rib', gastr: 'stomach', fibr: 'fiber', hem: 'blood', rhin: 'nose', nas: 'nose', phleb: 'vein', ven: 'vein', pulmon: 'lung', bronch: 'bronchus', trache: 'trachea', thromb: 'clot', capn: 'carbon dioxide', cyan: 'blue', ceps: 'heads', itis: 'inflammation', pathy: 'disease', logy: 'study of', ectomy: 'cut out or remove', tomy: 'cut', scopy: 'viewing', plasty: 'reconstruction or reforming', cyte: 'cell', megaly: 'enlargement', pnea: 'breathing', centesis: 'puncture', graphy: 'recording', graph: 'recorder', metry: 'measuring', meter: 'measurer'};
  function meaning(part) {
    if (part.role === 'vowel') return 'Connects word parts; adds no separate meaning';
    return meanings[normalize(part.text)] || ({prefix: 'Modifies the beginning of a term', root: 'Carries the core meaning of a term', suffix: 'Adds an ending to a term'})[part.role];
  }
  return {columns, sets, difficulties, roles, roleOf, normalize, parts, parseCSV, merge, shuffle, exact, boundaries, meaning};
})();
