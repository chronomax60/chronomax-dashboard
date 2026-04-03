// Stockage global des dernières données
window._lastCommandes = [];
window._lastProduits = [];

/**
 * Données démo pour la première démo.
 * À supprimer une fois Google Sheets configuré.
 */
const DEMO = {
  enabled: false, // Mode démo désactivé — données réelles via Google Sheets

  produits: [
    { 'ID produit': 'P001', 'Nom': 'Burger Classic', 'Catégorie': 'Plats', 'Prix vente HT': '8.50', 'Coût revient HT': '2.80', 'TVA (%)': '10' },
    { 'ID produit': 'P002', 'Nom': 'Pizza Margherita', 'Catégorie': 'Plats', 'Prix vente HT': '11.00', 'Coût revient HT': '3.50', 'TVA (%)': '10' },
    { 'ID produit': 'P003', 'Nom': 'Salade César', 'Catégorie': 'Entrées', 'Prix vente HT': '7.00', 'Coût revient HT': '2.00', 'TVA (%)': '10' },
    { 'ID produit': 'P004', 'Nom': 'Tiramisu', 'Catégorie': 'Desserts', 'Prix vente HT': '6.00', 'Coût revient HT': '1.50', 'TVA (%)': '10' },
    { 'ID produit': 'P005', 'Nom': 'Coca-Cola', 'Catégorie': 'Boissons', 'Prix vente HT': '3.00', 'Coût revient HT': '0.80', 'TVA (%)': '20' },
    { 'ID produit': 'P006', 'Nom': 'Pâtes Carbonara', 'Catégorie': 'Plats', 'Prix vente HT': '10.00', 'Coût revient HT': '3.00', 'TVA (%)': '10' },
    { 'ID produit': 'P007', 'Nom': 'Eau minérale', 'Catégorie': 'Boissons', 'Prix vente HT': '2.00', 'Coût revient HT': '0.30', 'TVA (%)': '10' },
  ],

  genererCommandes() {
    const commandes = [];
    const produits = this.produits;
    const today = new Date().toISOString().slice(0, 10);
    const hier = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    let id = 1;

    // Générer des commandes pour les 7 derniers jours
    for (let j = 6; j >= 0; j--) {
      const date = new Date();
      date.setDate(date.getDate() - j);
      const dateStr = date.toISOString().slice(0, 10);
      const nbCommandes = j === 0 ? 25 : Math.floor(Math.random() * 20) + 15;

      for (let i = 0; i < nbCommandes; i++) {
        const prod = produits[Math.floor(Math.random() * produits.length)];
        const qty = Math.floor(Math.random() * 3) + 1;
        const prixHT = parseFloat(prod['Prix vente HT']);
        const totalHT = prixHT * qty;
        const tva = parseFloat(prod['TVA (%)']) / 100;
        const totalTTC = totalHT * (1 + tva);
        const heure = String(11 + Math.floor(Math.random() * 10)).padStart(2, '0');
        const minute = String(Math.floor(Math.random() * 60)).padStart(2, '0');
        const serveurs = ['Jean', 'Marie', 'Lucas', 'Sophie'];

        commandes.push({
          'ID commande': `ORD-${dateStr}-${String(id).padStart(3, '0')}`,
          'Date/Heure': `${dateStr} ${heure}:${minute}:00`,
          'Produit': prod['Nom'],
          'Quantité': String(qty),
          'Prix unitaire HT': prod['Prix vente HT'],
          'Total HT': totalHT.toFixed(2),
          'TVA (%)': prod['TVA (%)'],
          'Total TTC': totalTTC.toFixed(2),
          'Serveur': serveurs[Math.floor(Math.random() * serveurs.length)],
          'Mode de paiement': Math.random() > 0.4 ? 'CB' : 'Espèces',
        });
        id++;
      }
    }
    return commandes;
  },
};

const App = {
  intervalId: null,

  async refresh() {
    try {
      let commandes, produits;

      if (DEMO.enabled) {
        // Mode démo : données générées localement
        if (window._lastCommandes.length === 0) {
          commandes = DEMO.genererCommandes();
          produits = DEMO.produits;
        } else {
          commandes = window._lastCommandes;
          produits = window._lastProduits;
        }
      } else {
        // Mode production : lecture Google Sheets
        const data = await SheetsAPI.fetchAll();
        commandes = data.commandes;
        produits = data.produits;
      }

      window._lastCommandes = commandes;
      window._lastProduits = produits;

      KPI.render(commandes, produits);
      TopProduits.render(commandes);
      EvolutionChart.render(commandes);
      TvaMarge.render(commandes, produits);

      document.getElementById('status-text').textContent =
        (DEMO.enabled ? 'DÉMO — ' : '') + 'Mis à jour : ' + new Date().toLocaleTimeString('fr-FR');

    } catch (error) {
      console.error('Erreur de rafraîchissement:', error);
      document.getElementById('status-text').textContent = 'Erreur de connexion';
      document.querySelector('.pulse-dot').style.background = '#ef4444';
    }
  },

  async start() {
    TvaMarge.initSelectors();
    await this.refresh();
    this.intervalId = setInterval(() => this.refresh(), CONFIG.REFRESH_INTERVAL);
    console.log(`ChronoMax Dashboard démarré ${DEMO.enabled ? '(MODE DÉMO)' : ''} — rafraîchissement toutes les ${CONFIG.REFRESH_INTERVAL / 1000}s`);
  },
};

document.addEventListener('DOMContentLoaded', () => App.start());
