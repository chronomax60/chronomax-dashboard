#!/usr/bin/env node
// Construit la configuration de l'assistant vocal à partir des fichiers de
// donnees/ (ou du Google Sheet), puis la crée / met à jour sur Vapi.
//
//   node scripts/build-assistant.mjs          -> génère dist/assistant.json (aucun envoi)
//   node scripts/build-assistant.mjs --push   -> envoie la configuration à Vapi
//
// Aucune dépendance : Node 18+ suffit.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VAPI_API = 'https://api.vapi.ai';

// --- .env minimal -----------------------------------------------------------
async function loadEnv() {
  const file = join(ROOT, '.env');
  if (!existsSync(file)) return;
  for (const line of (await readFile(file, 'utf8')).split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// --- Tarifs -----------------------------------------------------------------
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim() !== ''));
}

async function loadTarifRows() {
  const { GOOGLE_API_KEY, SPREADSHEET_ID, SHEET_TARIFS = 'Tarifs' } = process.env;
  if (GOOGLE_API_KEY && SPREADSHEET_ID) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}` +
      `/values/${encodeURIComponent(SHEET_TARIFS)}?key=${GOOGLE_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Google Sheets : ${res.status} ${await res.text()}`);
    console.log(`Tarifs lus depuis l'onglet « ${SHEET_TARIFS} » du Google Sheet.`);
    return (await res.json()).values ?? [];
  }
  console.log('Tarifs lus depuis donnees/tarifs.csv.');
  return parseCsv(await readFile(join(ROOT, 'donnees/tarifs.csv'), 'utf8'));
}

function formatTarifs(rows) {
  const [header, ...lines] = rows;
  if (!header || lines.length === 0) throw new Error('La grille des tarifs est vide.');
  const cols = header.map(h => h.trim().toLowerCase());
  const required = ['marque', 'modele', 'prestation', 'prix_ttc'];
  const missing = required.filter(c => !cols.includes(c));
  if (missing.length) throw new Error(`Colonnes manquantes dans la grille : ${missing.join(', ')}`);

  return lines.map(values => {
    const r = Object.fromEntries(cols.map((c, i) => [c, (values[i] ?? '').trim()]));
    const prix = Number(String(r.prix_ttc).replace(',', '.').replace(/[^\d.]/g, ''));
    if (r.prix_ttc === '' || Number.isNaN(prix)) {
      throw new Error(`Prix invalide pour « ${r.marque} ${r.modele} – ${r.prestation} » : « ${r.prix_ttc} »`);
    }
    const parts = [
      r.categorie && `[${r.categorie}]`,
      [r.marque, r.modele].filter(v => v && v.toLowerCase() !== 'toutes').join(' ') || 'Tous appareils',
      `– ${r.prestation} :`,
      prix === 0 ? 'gratuit' : `${prix} € TTC`,
      r.delai && `(délai : ${r.delai})`,
      r.remarque && `— ${r.remarque}`,
    ];
    return '- ' + parts.filter(Boolean).join(' ');
  }).join('\n');
}

// --- Assemblage -------------------------------------------------------------
function render(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`Variable inconnue dans le prompt : {{${k}}}`);
    return vars[k];
  });
}

async function buildAssistant() {
  const entreprise = JSON.parse(await readFile(join(ROOT, 'donnees/entreprise.json'), 'utf8'));
  const sav = (await readFile(join(ROOT, 'donnees/sav.md'), 'utf8')).replace(/<!--[\s\S]*?-->/g, '').trim();
  const tarifs = formatTarifs(await loadTarifRows());
  const template = await readFile(join(ROOT, 'prompt/system-prompt.md'), 'utf8');
  const systemPrompt = render(template, { ...entreprise, tarifs, sav });

  const todo = [systemPrompt.includes('À COMPLÉTER') && 'des champs « À COMPLÉTER »',
    systemPrompt.includes('EXEMPLE') && 'des tarifs « EXEMPLE »'].filter(Boolean);
  if (todo.length) console.warn(`⚠️  Il reste ${todo.join(' et ')} : à remplacer avant la mise en service.`);

  const assistant = {
    name: `${entreprise.nom_assistant} – ${entreprise.nom}`,
    firstMessage: entreprise.message_accueil,
    transcriber: { provider: 'deepgram', model: 'nova-2', language: 'fr' },
    model: {
      provider: process.env.VAPI_MODEL_PROVIDER || 'anthropic',
      model: process.env.VAPI_MODEL || 'claude-haiku-5-5',
      temperature: 0.2,
      messages: [{ role: 'system', content: systemPrompt }],
      tools: [{
        type: 'transferCall',
        destinations: [{
          type: 'number',
          number: entreprise.numero_transfert,
          message: "Je vous mets en relation avec un conseiller, un instant s'il vous plaît.",
          description: `${entreprise.responsable} (ChronoMax)` + ' : questions hors grille, SAV complexe, client mécontent.',
        }],
      }],
    },
    endCallFunctionEnabled: true,
    analysisPlan: {
      summaryPrompt: "Résume l'appel en français en 3 lignes : nom et numéro du client si donnés, " +
        "appareil et demande, prix annoncé, et si l'appel a été transféré ou nécessite un rappel.",
    },
  };

  if (process.env.VAPI_VOICE_PROVIDER && process.env.VAPI_VOICE_ID) {
    assistant.voice = { provider: process.env.VAPI_VOICE_PROVIDER, voiceId: process.env.VAPI_VOICE_ID };
  }
  return assistant;
}

async function pushToVapi(assistant) {
  const { VAPI_API_KEY, VAPI_ASSISTANT_ID } = process.env;
  if (!VAPI_API_KEY) throw new Error('VAPI_API_KEY manquant (voir .env.example).');
  const url = VAPI_ASSISTANT_ID ? `${VAPI_API}/assistant/${VAPI_ASSISTANT_ID}` : `${VAPI_API}/assistant`;
  const res = await fetch(url, {
    method: VAPI_ASSISTANT_ID ? 'PATCH' : 'POST',
    headers: { Authorization: `Bearer ${VAPI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(assistant),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Vapi : ${res.status} ${body}`);
  const { id } = JSON.parse(body);
  console.log(VAPI_ASSISTANT_ID ? `✅ Assistant ${id} mis à jour.`
    : `✅ Assistant créé : ${id}\n   Ajoute VAPI_ASSISTANT_ID=${id} dans .env pour les prochaines mises à jour.`);
}

// --- Main -------------------------------------------------------------------
await loadEnv();
try {
  const assistant = await buildAssistant();
  await mkdir(join(ROOT, 'dist'), { recursive: true });
  await writeFile(join(ROOT, 'dist/assistant.json'), JSON.stringify(assistant, null, 2));
  await writeFile(join(ROOT, 'dist/prompt.txt'), assistant.model.messages[0].content);
  console.log('Configuration générée : dist/assistant.json (prompt lisible : dist/prompt.txt)');
  if (process.argv.includes('--push')) await pushToVapi(assistant);
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}
