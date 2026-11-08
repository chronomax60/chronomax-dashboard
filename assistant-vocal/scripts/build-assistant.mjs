#!/usr/bin/env node
// Construit la configuration de l'assistant vocal à partir des fichiers de
// donnees/ et des tarifs publiés sur chronomax.fr, puis la crée / met à jour sur Vapi.
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

const SITE_API = process.env.SITE_API || 'https://api.chronomax.fr';

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url} : ${res.status} ${await res.text()}`);
  return res.json();
}

// Chaque tarif est normalisé en { modele, prestation, prix, delai, remarque }.
async function loadTarifs() {
  const source = (process.env.TARIFS_SOURCE || 'site').toLowerCase();

  if (source === 'site') {
    const filtre = (process.env.TARIFS_FILTRE ?? 'iphone').toLowerCase();
    const all = await getJson(`${SITE_API}/api/telephones`);
    const items = all
      .filter(t => t.actif !== false)
      .filter(t => !filtre || `${t.marque} ${t.modele}`.toLowerCase().includes(filtre))
      .map(t => ({ modele: t.modele, prestation: t.panne, prix: t.prix }));
    console.log(`Tarifs lus sur le site (${SITE_API}) : ${items.length} lignes` +
      (filtre ? ` (filtre « ${filtre} »).` : '.'));
    return items;
  }

  let rows;
  if (source === 'sheet') {
    const { GOOGLE_API_KEY, SPREADSHEET_ID, SHEET_TARIFS = 'Tarifs' } = process.env;
    if (!GOOGLE_API_KEY || !SPREADSHEET_ID) throw new Error('GOOGLE_API_KEY et SPREADSHEET_ID requis.');
    const data = await getJson(`https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}` +
      `/values/${encodeURIComponent(SHEET_TARIFS)}?key=${GOOGLE_API_KEY}`);
    rows = data.values ?? [];
    console.log(`Tarifs lus depuis l'onglet « ${SHEET_TARIFS} » du Google Sheet.`);
  } else {
    rows = parseCsv(await readFile(join(ROOT, 'donnees/tarifs.csv'), 'utf8'));
    console.log('Tarifs lus depuis donnees/tarifs.csv.');
  }
  const [header = [], ...lines] = rows;
  const cols = header.map(h => h.trim().toLowerCase());
  const missing = ['modele', 'prestation', 'prix_ttc'].filter(c => !cols.includes(c));
  if (missing.length) throw new Error(`Colonnes manquantes dans la grille : ${missing.join(', ')}`);
  return lines.map(values => {
    const r = Object.fromEntries(cols.map((c, i) => [c, (values[i] ?? '').trim()]));
    const modele = [r.marque, r.modele].filter(v => v && v.toLowerCase() !== 'toutes').join(' ') || 'Tous appareils';
    return { modele, prestation: r.prestation, prix: r.prix_ttc, delai: r.delai, remarque: r.remarque };
  });
}

// Une ligne par modèle : plus court à lire pour le modèle, donc des réponses plus rapides.
function formatTarifs(items) {
  if (items.length === 0) throw new Error('La grille des tarifs est vide.');
  const parModele = new Map();
  for (const t of items) {
    const prix = Number(String(t.prix).replace(',', '.').replace(/[^\d.]/g, ''));
    if (t.prix === '' || t.prix == null || Number.isNaN(prix)) {
      throw new Error(`Prix invalide pour « ${t.modele} – ${t.prestation} » : « ${t.prix} »`);
    }
    const detail = [t.delai && `délai ${t.delai}`, t.remarque].filter(Boolean).join(', ');
    const texte = `${t.prestation} ${prix === 0 ? 'gratuit' : `${prix} €`}${detail ? ` (${detail})` : ''}`;
    if (!parModele.has(t.modele)) parModele.set(t.modele, []);
    parModele.get(t.modele).push(texte);
  }
  return [...parModele].map(([modele, lignes]) => `- ${modele} : ${lignes.join(' ; ')}`).join('\n');
}

// Adresse, horaires et téléphone tels qu'affichés sur chronomax.fr.
async function loadInfosSite() {
  try {
    const s = await getJson(`${SITE_API}/api/settings`);
    return {
      adresse: `${s.addressLine}, ${s.postalCode} ${s.city}`,
      horaires: s.horaires.map(h => `${h.jour} : ${h.heures}`).join(' ; '),
    };
  } catch (err) {
    console.warn(`⚠️  Infos du site indisponibles (${err.message}) : valeurs de entreprise.json utilisées.`);
    return {};
  }
}

// --- Assemblage -------------------------------------------------------------
function render(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    if (!(k in vars)) throw new Error(`Variable inconnue dans le prompt : {{${k}}}`);
    return vars[k];
  });
}

const CAS_ESCALADE = `   - question sur un produit en vente (disponibilité, prix, accessoires, reprise) ;
   - le modèle ou la prestation n'est pas dans la grille ;
   - la réponse n'est pas dans les conditions SAV ;
   - le client est mécontent, réclame un remboursement, ou demande à parler à quelqu'un ;
   - tu as le moindre doute.`;

// mode_escalade (entreprise.json) : « message » = Alice prend un message pour un rappel,
// « transfert » = Alice transfère l'appel vers numero_transfert.
function texteEscalade(e) {
  if (e.mode_escalade === 'transfert') {
    return `3. Transférer l'appel à un conseiller (outil de transfert) dans ces cas :
${CAS_ESCALADE}
   Avant de transférer, dis : « Je vous mets en relation avec un conseiller, un instant s'il vous plaît. »
4. Si le transfert échoue ou si l'on est hors horaires : ${e.hors_horaires}
   Rassure le client : ${e.responsable} et ses collègues étudieront sa demande à partir de la retranscription de l'appel.`;
  }
  return `3. Prendre un message pour que le client soit rappelé, dans ces cas :
${CAS_ESCALADE}
   Tu ne peux PAS transférer l'appel. Dis par exemple : « Je n'ai pas cette information, mais je note
   votre demande : ${e.responsable} ou l'un de ses collègues vous rappellera. »
   Puis demande, une question à la fois :
   a. le nom du client ;
   b. le numéro où le rappeler — répète-le chiffre par chiffre pour le faire confirmer ;
   c. l'appareil concerné (marque et modèle) ;
   d. sa demande, en une phrase.
   Termine en résumant la demande et en précisant que le rappel se fera pendant les horaires
   d'ouverture. Ne promets pas de délai de rappel précis.`;
}

async function buildAssistant() {
  const entreprise = JSON.parse(await readFile(join(ROOT, 'donnees/entreprise.json'), 'utf8'));
  Object.assign(entreprise, await loadInfosSite());
  const sav = (await readFile(join(ROOT, 'donnees/sav.md'), 'utf8')).replace(/<!--[\s\S]*?-->/g, '').trim();
  const tarifs = formatTarifs(await loadTarifs());
  const template = await readFile(join(ROOT, 'prompt/system-prompt.md'), 'utf8');
  const systemPrompt = render(template, { ...entreprise, tarifs, sav, escalade: texteEscalade(entreprise) });

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
    },
    endCallFunctionEnabled: true,
    analysisPlan: {
      summaryPrompt: "Résume l'appel en français. Si un rappel est nécessaire, commence par « À RAPPELER ». " +
        "Indique ensuite : nom et numéro de rappel du client, appareil (marque et modèle), " +
        "demande, et prix annoncé le cas échéant.",
    },
  };

  if (entreprise.mode_escalade === 'transfert') {
    assistant.model.tools = [{
      type: 'transferCall',
      destinations: [{
        type: 'number',
        number: entreprise.numero_transfert,
        message: "Je vous mets en relation avec un conseiller, un instant s'il vous plaît.",
        description: `${entreprise.responsable} (ChronoMax) : questions hors grille, SAV complexe, client mécontent.`,
      }],
    }];
  }

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
