# Vocabulary Learning Games Suite: Technical Specification & Game Designs

## Executive Overview

This project specifies three distinct, lightweight, single-page application (SPA) games built to teach vocabulary through a three-pillar pedagogical model:
1. **Spelling**: Reinforcing exact orthography and letter sequences.
2. **Division (Morphology)**: Deconstructing and identifying prefixes, multiple roots, connecting vowels, and suffixes.
3. **Definition**: Associating composite terms with their core semantic meanings and understanding how sub-parts contribute to the whole.

Each game runs as a self-contained, standalone web application requiring no build steps, backend servers, or external network dependencies, ensuring complete offline capability directly from a local browser session.

---

## Technical Architecture & Constraints

### 1. Standalone Single-Page Application (SPA) Design
* **Zero External Dependencies**: All CSS, JavaScript, and SVG visual assets are embedded directly into each game's single `.html` file (e.g., `forge.html`, `surgeon.html`, `trail.html`).
* **Offline Execution**: Designed to execute seamlessly under both `file://` and local `http://localhost` protocols. Fetch falls back gracefully to `XMLHttpRequest` or embedded CSV drag-and-drop / file-input if strict local CORS limits block standard `fetch()` under `file://`.
* **Hardware-Accelerated UI**: Uses CSS Grid, Flexbox, and GPU-accelerated CSS transforms (`translate3d`, `scale`) to deliver fluid 60 FPS animations on mobile devices (iOS Safari, Android Chrome) and desktop viewports.
* **Responsive Touch & Pointer Model**: Unified Pointer Events API (`pointerdown`, `pointermove`, `pointerup`) with `touch-action: manipulation` to guarantee zero-latency response without 300ms mobile tap delays.

### 2. URL Database Parameter Parsing (`?db_file=...`)
Each SPA inspects its own URL query parameters on initialization to determine which CSV file(s) to load.

* **Single File**: `forge.html?db_file=medical_roots.csv`
* **Multi-File Aggregation**: `forge.html?db_file=medical_terminology_set01.csv,medical_terminology_set02.csv,advanced_prefixes.csv`
* **Set Selection**: The title screen provides checkboxes for sets 1?12 and passes `sets=1,2,...`, the corresponding `db_file` filenames, and `difficulty=easy|medium|hard` through GET parameters. `sets` takes precedence over filenames. All 12 sets are selected by default; empty selections cannot launch a game.
* **Default Fallback**: If no database parameter is provided, all 12 sets load. Each set is also embedded separately so selected sets work offline when CSV requests are blocked.
* **URL Parsing Logic**:
  ```javascript
  function getDatabaseFiles() {
    const params = new URLSearchParams(window.location.search);
    const dbParam = params.get('db_file');
    if (!dbParam) return ['words.csv'];
    return dbParam.split(',').map(f => f.trim()).filter(f => f.length > 0);
  }
  ```
* **Multi-CSV Merger**: The engine loads each specified CSV file asynchronously, parses them, strips duplicate header rows, validates record integrity, and merges them into an active session pool.

---

## CSV Database Schema

All database CSV files reside in the same folder as the HTML application files. The schema accommodates multi-root compounds and connecting vowels (common in Greco-Latin, scientific, and medical vocabulary):

### Header Specification
```csv
Term,Phonetics,prefix,root_1,c_vowel_1,root_2,c_vowel_2,root_3,c_vowel_3,suffix_1,Basic Definition
```

### Column Definitions
| Column Header | Data Type | Requirement | Description & Rules |
| :--- | :--- | :--- | :--- |
| **`Term`** | String | Required | The unified, correctly spelled target vocabulary word (e.g., `gastroenteritis`). |
| **`Phonetics`** | String | Optional | IPA or pronunciation guide (e.g., `/ˌɡæstroʊˌɛntəˈraɪtɪs/`). Rendered as audio cue or helper hint. |
| **`prefix`** | String | Optional | Leading affix modifying the root (e.g., `sub`, `hyper`, `electro`). Blank if absent. |
| **`root_1`** | String | Required | Primary base root of the term (e.g., `gastr`, `cardi`, `neur`). |
| **`c_vowel_1`** | String | Optional | Combining vowel joining `root_1` to subsequent elements (e.g., `o`, `i`). |
| **`root_2`** | String | Optional | Secondary root in compound words (e.g., `enter`, `pulmon`). Blank for single-root words. |
| **`c_vowel_2`** | String | Optional | Combining vowel following `root_2`. |
| **`root_3`** | String | Optional | Tertiary root for complex multi-compound terms (e.g., `gram` in `electroencephalogram`). |
| **`c_vowel_3`** | String | Optional | Combining vowel following `root_3`. |
| **`suffix_1`** | String | Optional | Terminal affix denoting pathology, quality, or function (e.g., `itis`, `ology`, `ectomy`). |
| **`suffix_2`** | String | Optional | Additional suffix, when supplied; follows `suffix_1`. Older CSVs without this column remain supported. |
| **`Basic Definition`** | String | Required | Clear, student-friendly definition describing the whole term. |

### Sample Dataset (`medical_vocab.csv`)
```csv
Term,Phonetics,prefix,root_1,c_vowel_1,root_2,c_vowel_2,root_3,c_vowel_3,suffix_1,Basic Definition
cardiology,/ˌkɑːrdiˈɒlədʒi/,,cardi,o,,,,logy,The study of the heart and its functions
gastroenteritis,/ˌɡæstroʊˌɛntəˈraɪtɪs/,,gastr,o,enter,,,itis,Inflammation of the stomach and small intestine
electroencephalogram,/ɪˌlɛktroʊɛnˈsɛfələˌɡræm/,electro,,encephal,o,gram,,,A test that detects electrical activity in the brain
hypodermic,/ˌhaɪpəˈdɜːrmɪk/,hypo,derm,,,,ic,Pertaining to the area beneath the skin
otorhinolaryngology,/ˌoʊtoʊˌraɪnoʊˌlærɪŋˈɡɒlədʒi/,,ot,o,rhin,o,laryng,,ology,The study of diseases of the ear nose and throat
subcutaneous,/ˌsʌbkjuːˈteɪniəs/,sub,cutan,,,,eous,Located or introduced under the skin
pathology,/pəˈθɒlədʒi/,,path,o,,,,logy,The scientific study of disease and its causes
```

---

## Detailed Game Designs

### Game 1: Morpheme Forge (`forge.html`)
*Theme: An interactive alchemy lab / word fabrication workshop.*

#### Core Gameplay Flow
1. **Definition Briefing**: The screen presents the target definition (e.g., *"Inflammation of the stomach and small intestine"*) with pronunciation hidden behind a hint button. Revealing the written guide or playing audio during the round reduces the award to 75 points and breaks the clean streak; replay after completion is free.
2. **Morphological Slotting (Division)**:
   * The play field shows structured assembly bays: `[Prefix]` + `[Root 1]` + `[Connecting Vowel]` + `[Root 2]` + `[Suffix]`. Slots that do not apply to the current term remain collapsed.
   * A pool of tactile, draggable/tappable tiles appears at the bottom. The pool contains the valid components mixed with 2–3 randomized distractors drawn from other rows in the CSV.
   * Tiles are color-coded by role:
     * **Indigo**: Prefixes
     * **Emerald**: Roots (`root_1`, `root_2`, `root_3`)
     * **Amber**: Connecting vowels (`c_vowel_1`, `c_vowel_2`, `c_vowel_3`)
     * **Rose**: Suffixes
   * Placing a component into the bay triggers a satisfying snap animation and immediately highlights its sub-meaning tooltip.
3. **Synthesis & Spelling**:
   * Once all components are slotted in order, the assembly bays lock together.
   * The player must type the finalized, seamless word into the synthesis field (`gastroenteritis`).
   * This reinforces how morphemes merge into one cohesive spelling without rogue spaces or hyphens.
4. **Scoring & Feedback**:
   * Bonus points for first-try tile placement and clean keyboard accuracy.
   * Visual sparkle effects and pronunciation replay upon round completion.

---

### Game 2: Word Surgeon (`surgeon.html`)
*Theme: A clinical word laboratory where students dissect complex terms.*

#### Core Gameplay Flow
1. **Patient Intake (Definition & Spelling Check)**:
   * The player receives the patient chart displaying the `Basic Definition` and `Phonetics`.
   * A scrambled or partially masked term appears on the medical tray.
   * The player enters or selects the correct letter sequence to confirm diagnosis and prepare the term for surgery.
2. **The Dissection Procedure (Division)**:
   * The fully spelled word is placed on the operating table as a continuous interactive ribbon:
     `[ G ][ A ][ S ][ T ][ R ][ O ][ E ][ N ][ T ][ E ][ R ][ I ][ T ][ I ][ S ]`
   * **Scalpel Mode**: The player taps or drags incision lines between letters to slice the word into chunks.
   * **Tagging Mode**: Once incisions are made, the player selects tag badges to label each sliced fragment:
     * `Prefix` | `Root` | `Connecting Vowel` | `Suffix`
   * If a student slices `GASTRO` as one chunk instead of `GASTR` + `O`, the system flags an uneven cut and explains the role of the connecting vowel.
3. **Post-Op Review**:
   * Each isolated segment links back to its etymological root.
   * The game presents a rapid quiz with a visible countdown matching the dissected parts to their individual definitions before advancing to the next patient. Title-screen difficulty sets the time per review question: Easy 20 seconds, Medium 15 seconds (default), Hard 10 seconds. Timers pause for dialogs and hidden tabs.

---

### Game 3: The Decryption Trail (`trail.html`)
*Theme: A high-energy, three-stage puzzle vault challenge.*

#### Core Gameplay Flow
Each word is a locked chamber requiring three sequential keys to breach:

* **Gate 1: The Crypt (Definition)**:
  * A 3-choice dynamic dial presents different definitions.
  * The player selects the definition matching the target term to release the gate mechanism.
* **Gate 2: The Formula Matrix (Division)**:
  * The chamber displays structural blueprint options for how the word is constructed:
    * Option A: `[Root: gastr] + [Vowel: o] + [Root: enter] + [Suffix: itis]`
    * Option B: `[Prefix: gastro] + [Root: enteritis]`
    * Option C: `[Root: gastr] + [Root: oenter] + [Suffix: itis]`
  * Choosing the accurate morphological division opens the vault door.
* **Gate 3: The Keystroke Vault (Spelling)**:
  * The blueprint vanishes. The player must spell the full term under time pressure using an on-screen keyboard or physical keyboard.
  * Instant feedback visually indicates correct keystrokes in green and incorrect inputs with a gentle screen shake.
  * Streaks multiply score points, unlocking achievements as players clear word lists.

---

## Technical Implementation Guide

### Directory Structure
To run offline, files should be organized in a single folder:
```text
vocabulary_games/
├── forge.html                 # Game 1: Morpheme Forge SPA
├── surgeon.html               # Game 2: Word Surgeon SPA
├── trail.html                 # Game 3: The Decryption Trail SPA
├── index.html                 # Launcher / Menu hub (optional)
├── medical_roots.csv          # Sample DB 1
├── general_prefixes.csv       # Sample DB 2
└── biology_terms.csv          # Sample DB 3
```

### Robust Local CSV Parser
Because these SPAs operate client-side without third-party libraries, each game includes this lightweight CSV parsing algorithm capable of handling quoted fields, commas inside definitions, and carriage returns:

```javascript
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];

  // Parse header
  const headers = parseLine(lines[0]);

  // Parse records
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    if (values.length === headers.length) {
      const entry = {};
      headers.forEach((h, idx) => {
        entry[h.trim()] = values[idx].trim();
      });
      records.push(entry);
    }
  }
  return records;

  function parseLine(line) {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(cur);
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur);
    return result;
  }
}
```

### Multi-File Loader with Fallback
```javascript
async function loadDatabases() {
  const files = getDatabaseFiles();
  let allWords = [];

  for (const file of files) {
    try {
      const response = await fetch(file);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      const rows = parseCSV(text);
      allWords = allWords.concat(rows);
    } catch (err) {
      console.warn(`Could not load ${file} via fetch:`, err);
    }
  }

  if (allWords.length === 0) {
    showManualFilePickerFallback();
  } else {
    initializeGameSession(allWords);
  }
}
```

---

## Responsive Design & Visual Standards

| Platform | Screen Dimensions | Interaction Pattern | Layout Strategy |
| :--- | :--- | :--- | :--- |
| **Mobile (Portrait)** | 320px – 480px width | Tap-to-select, snap-to-slot, large touch targets (min 48×48px) | Single-column stacked; sticky definition bar at top; virtual keyboard at bottom |
| **Tablet (Portrait/Landscape)** | 768px – 1024px width | Drag-and-drop with touch fallback, smooth reordering | Two-column split or centered workbench with expanded tile tray |
| **Desktop** | 1024px+ width | Full drag-and-drop, physical keyboard shortcuts (Enter to submit, Space to advance) | Wide ergonomic workbench, side stats panel, detailed morphological glossary |

### Color & Contrast Standards
* **Background Canvas**: Deep slate blue (`#0F172A`) for high contrast and reduced eye fatigue.
* **Component Cards**:
  * Prefix: Vivid Blue (`#3B82F6`, border `#60A5FA`)
  * Roots: Emerald Green (`#10B981`, border `#34D399`)
  * Connecting Vowels: Warm Amber (`#F59E0B`, border `#FBBF24`)
  * Suffix: Rose Magenta (`#EC4899`, border `#F472B6`)
* **Typography**: System font stack (`system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`) ensures crisp rendering on all operating systems without external web-font requests.
