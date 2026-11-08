# Assistant vocal ChronoMax

Assistant téléphonique qui :
- répond aux clients en français ;
- donne les **tarifs de réparation** à partir de ta grille (et rien d'autre) ;
- répond aux questions **SAV / garantie** à partir de tes conditions ;
- **transfère l'appel** vers ton numéro quand il ne connaît pas la réponse ;
- produit une **transcription et un résumé** de chaque appel.

Plateforme téléphonique : [Vapi](https://vapi.ai). Elle gère le numéro, la voix et la transcription.
Ce dossier contient la configuration de l'assistant, sous forme de fichiers simples à modifier.

## D'où viennent les informations

| Information | Source |
|---|---|
| **Tarifs iPhone** | Lus directement sur **chronomax.fr** (`api.chronomax.fr/api/telephones`). Un prix modifié sur le site est repris dès qu'on relance le script. |
| **Adresse, horaires** | Lus sur chronomax.fr (`/api/settings`), avec une copie de secours dans `donnees/entreprise.json` |
| **Conditions SAV / garanties** | `donnees/sav.md`. N'y mets que des informations vraies : pour le reste, Alice transfère. |
| **Nom, message d'accueil, numéro de transfert** | `donnees/entreprise.json` |
| **Comportement d'Alice** | `prompt/system-prompt.md` |

Pour élargir au-delà des iPhone, vide `TARIFS_FILTRE` dans `.env` (attention : le prompt dit aujourd'hui
« iPhone uniquement », il faudra l'adapter). `TARIFS_SOURCE=csv` ou `sheet` permet d'utiliser
`donnees/tarifs.csv` ou un onglet « Tarifs » du Google Sheet à la place du site.

## Mise en service (étapes)

1. **Créer un compte Vapi** et récupérer la clé API privée (Dashboard → API Keys).
2. `cp .env.example .env` puis coller la clé dans `VAPI_API_KEY`.
3. Vérifier `donnees/sav.md` et `donnees/entreprise.json`.
4. Générer et vérifier : `node scripts/build-assistant.mjs`, puis relire `dist/prompt.txt`.
5. Envoyer à Vapi : `node scripts/build-assistant.mjs --push`.
   Au premier envoi, noter l'ID affiché dans `VAPI_ASSISTANT_ID`.
6. Dans Vapi : choisir une **voix française**, acheter ou importer un **numéro**, puis le relier à l'assistant.
7. **Tester en appelant** : demander un prix connu, un modèle inconnu (il doit transférer), une question de garantie.
8. Mettre en place le **renvoi d'appel** de ton numéro pro vers le numéro Vapi (sur non-réponse, ou systématique).

Après chaque modification de tarifs sur le site : relancer l'étape 5.

## À vérifier

- La liste des modèles proposés par Vapi : ajuster `VAPI_MODEL` si `claude-haiku-5-5` n'y figure pas.
  Pour le téléphone, un modèle rapide est préférable.
- Le format exact de l'API Vapi (champs `transferCall`, `analysisPlan`…), à comparer avec leur documentation.
  En cas d'erreur, le message de Vapi s'affiche tel quel.
- RGPD : le message d'accueil annonce un assistant virtuel et l'enregistrement. Ajoute une mention dans tes CGV.

## Prochaines étapes

- Afficher les appels, avec résumé et transcription, dans le dashboard ChronoMax.
- Recevoir un SMS ou un e-mail récapitulatif après chaque appel.
