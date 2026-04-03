const TopProduits = {
  classement(commandes) {
    const today = new Date().toISOString().slice(0, 10);
    const jour = commandes.filter(c => (c['Date/Heure'] || '').startsWith(today));
    const counts = {};
    jour.forEach(c => {
      const nom = c['Produit'] || 'Inconnu';
      const qty = parseFloat(c['Quantité'] || 1);
      counts[nom] = (counts[nom] || 0) + qty;
    });
    return Object.entries(counts)
      .map(([nom, quantite]) => ({ nom, quantite }))
      .sort((a, b) => b.quantite - a.quantite);
  },

  render(commandes) {
    const container = document.getElementById('top-produits');
    const top = this.classement(commandes);

    if (top.length === 0) {
      container.innerHTML = '<p class="text-gray-400 text-sm">Aucune vente aujourd\'hui</p>';
      return;
    }

    const max = top[0].quantite;
    const topN = top.slice(0, 8);
    const colors = ['bg-brand-blue', 'bg-brand-violet', 'bg-brand-cyan', 'bg-blue-400', 'bg-violet-400', 'bg-cyan-400', 'bg-blue-300', 'bg-violet-300'];

    container.innerHTML = topN.map((item, i) => {
      const pct = (item.quantite / max * 100).toFixed(0);
      const color = colors[i % colors.length];
      return `
        <div class="flex items-center gap-3">
          <span class="text-sm font-medium text-gray-600 w-24 truncate">${item.nom}</span>
          <div class="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
            <div class="product-bar ${color} h-5 rounded-full" style="width: ${pct}%"></div>
          </div>
          <span class="text-sm font-semibold text-gray-700 w-8 text-right">${item.quantite}</span>
        </div>
      `;
    }).join('');
  },
};
