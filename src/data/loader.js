/**
 * Data Loader -- loads character and event data from JSON + Markdown files
 *
 * Markdown narrative format:
 *   ## Background / 背景
 *   ## Process / 经过
 *   ## Result / 结果
 *   ---
 *   ### Scene: Title / 场景: Title
 *   > Speaker (emotion): "Dialogue text"
 *
 * Locale-aware: reads _en fields and .en.md files when locale is 'en'.
 */
import { getLocale, t } from '../i18n/index.js';

// ── Section name mapping ──────────────────────────────────
// Keys are what appears in the markdown; values are internal IDs.
const SECTION_MAP_ZH = {
  '背景': 'background',
  '经过': 'process',
  '结果': 'result',
};

const SECTION_MAP_EN = {
  'Background': 'background',
  'Process': 'process',
  'Result': 'result',
};

function getSectionMap() {
  return getLocale() === 'en' ? { ...SECTION_MAP_EN, ...SECTION_MAP_ZH } : SECTION_MAP_ZH;
}

// Tab labels displayed in the UI (derived from i18n)
export function getSectionLabels() {
  return {
    background: t('tabBackground'),
    process: t('tabProcess'),
    result: t('tabResult'),
  };
}

// For backward compatibility — static export (evaluated at load time)
export const SECTION_LABELS = {
  get background() { return t('tabBackground'); },
  get process() { return t('tabProcess'); },
  get result() { return t('tabResult'); },
};

// Scene header prefix used in markdown
function getScenePrefixes() {
  return getLocale() === 'en' ? ['Scene', '场景'] : ['场景', 'Scene'];
}

// ── Data imports (Vite eager glob) ────────────────────────
const characterModules = import.meta.glob('../../data/characters/*.json', { eager: true });
const eventModules = import.meta.glob('../../data/events/*.json', { eager: true });
const eventMarkdown = import.meta.glob('../../data/events/*.md', { eager: true, query: '?raw', import: 'default' });
import timelineConfig from '../../data/timeline.json';

// Map data imports
import locationsData from '../../data/map/locations.json';
import territoriesData from '../../data/map/territories.json';
import characterLocationsData from '../../data/map/character-locations.json';
import usStatesTopo from '../../data/map/us-states-topo.json';

/**
 * Load the master timeline configuration
 */
export async function loadTimeline() {
  return timelineConfig;
}

/**
 * Load all character data
 */
export function loadCharacters() {
  const characters = {};
  for (const [path, mod] of Object.entries(characterModules)) {
    const data = mod.default || mod;
    characters[data.id] = data;
  }
  return characters;
}

/**
 * Load all event data with their markdown narratives
 */
export function loadEvents() {
  const locale = getLocale();
  const events = {};
  for (const [path, mod] of Object.entries(eventModules)) {
    const data = mod.default || mod;
    events[data.id] = { ...data };
  }

  // Attach markdown content to events
  // Build path maps: base .md and .en.md
  const mdByBasename = {};
  const mdEnByBasename = {};
  for (const [path, content] of Object.entries(eventMarkdown)) {
    const filename = path.split('/').pop();
    if (filename.endsWith('.en.md')) {
      const basename = filename.replace('.en.md', '');
      mdEnByBasename[basename] = content;
    } else {
      const basename = filename.replace('.md', '');
      mdByBasename[basename] = content;
    }
  }

  for (const id of Object.keys(events)) {
    if (locale === 'en' && mdEnByBasename[id]) {
      events[id].markdownContent = mdEnByBasename[id];
    } else if (mdByBasename[id]) {
      events[id].markdownContent = mdByBasename[id];
    }
  }

  return events;
}

/**
 * Parse markdown content into sections and scenes
 */
export function parseNarrative(markdownContent) {
  if (!markdownContent) return { sections: {}, scenes: [] };

  const sectionMap = getSectionMap();
  const scenePrefixes = getScenePrefixes();

  const parts = markdownContent.split('---');
  const mainContent = parts[0] || '';
  const scenesRaw = parts.slice(1).join('---');

  // Build regex from section map keys
  const sectionNames = Object.keys(sectionMap).join('|');
  const sectionRegex = new RegExp(`## (${sectionNames})\\n([\\s\\S]*?)(?=## |$)`, 'g');

  const sections = {};
  let match;
  while ((match = sectionRegex.exec(mainContent)) !== null) {
    const name = match[1];
    const content = match[2].trim();
    const key = sectionMap[name];
    if (key) sections[key] = content;
  }

  // Parse scenes - try all known prefixes
  const scenes = [];
  const prefixPattern = scenePrefixes.join('|');
  const sceneRegex = new RegExp(`### (?:${prefixPattern})[：:]\\s*(.+?)\\n([\\s\\S]*?)(?=### (?:${prefixPattern})[：:]|$)`, 'g');
  while ((match = sceneRegex.exec(scenesRaw || mainContent)) !== null) {
    const title = match[1].trim();
    const body = match[2].trim();

    const lines = body.split('\n');
    const elements = [];
    let narrativeBuffer = '';

    for (const line of lines) {
      const dialogueMatch = line.match(/^>\s*(.+?)(?:（(.+?)）|\((.+?)\))?[：:]\s*"(.+?)"$/);
      if (dialogueMatch) {
        if (narrativeBuffer.trim()) {
          elements.push({ type: 'narrative', text: narrativeBuffer.trim() });
          narrativeBuffer = '';
        }
        elements.push({
          type: 'dialogue',
          speaker: dialogueMatch[1],
          emotion: dialogueMatch[2] || dialogueMatch[3] || null,
          text: dialogueMatch[4],
        });
      } else if (line.startsWith('> ')) {
        if (narrativeBuffer.trim()) {
          elements.push({ type: 'narrative', text: narrativeBuffer.trim() });
          narrativeBuffer = '';
        }
        const simpleDialogue = line.replace(/^>\s*/, '').match(/^(.+?)(?:（(.+?)）|\((.+?)\))?[：:]\s*"?(.+?)"?$/);
        if (simpleDialogue) {
          elements.push({
            type: 'dialogue',
            speaker: simpleDialogue[1],
            emotion: simpleDialogue[2] || simpleDialogue[3] || null,
            text: simpleDialogue[4].replace(/^"|"$/g, ''),
          });
        } else {
          elements.push({ type: 'quote', text: line.replace(/^>\s*/, '') });
        }
      } else {
        narrativeBuffer += line + '\n';
      }
    }
    if (narrativeBuffer.trim()) {
      elements.push({ type: 'narrative', text: narrativeBuffer.trim() });
    }

    scenes.push({ title, elements });
  }

  return { sections, scenes };
}

/**
 * Load everything and return a unified data store
 */
export async function loadAllData() {
  const [timeline] = await Promise.all([loadTimeline()]);
  const characters = loadCharacters();
  const events = loadEvents();

  for (const event of Object.values(events)) {
    if (event.markdownContent) {
      const parsed = parseNarrative(event.markdownContent);
      event.narrative_parsed = parsed;
    }
  }

  // Map data
  const mapData = {
    'us-states-topo': usStatesTopo,
    locations: locationsData,
    territories: territoriesData,
    'character-locations': characterLocationsData,
  };

  return { timeline, characters, events, mapData };
}
