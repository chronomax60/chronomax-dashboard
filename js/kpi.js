const KPI = {
  commandesDuJour(commandes) {
    const today = new Date().toISOString().slice(0, 10);
    return commandes.filter(c => (c['Date/Heure'] || '').startsWith(today));
  },

  commandesHier(commandes) {
    const hier = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    return commandes.filter(c => (c['Date/Heure'] || '').startsWith(hier));
  },

  calculerCA(commandes) {
    return commandes.reduce((sum, c) => sum + parseFloat(c['Total HT'] || 0), 0);
  },

  calculerMargeMoyenne(commandesJour, produits) {
    if (commandesJour.length === 0) return 0;
    const coutMap = {};
    produits.forEach(p => {
      coutMap[p['Nom']] = parseFloat(p['Coût revient HT'] || 0);
    });
    let totalVente = 0;
    let totalCout = 0;
    commandesJour.forEach(c => {
      const prixVente = parseFloat(c['Total HT'] || 0);
      const quantite = parseFloat(c['Quantité'] || 1);
      const coutUnitaire = coutMap[c['Produit']] || 0;
      totalVente += prixVente;
      totalCout += coutUnitaire * quantite;
    });
    if (totalVente === 0) return 0;
    return ((totalVente - totalCout) / totalVente) * 100;
  },

  render(commandes, produits) {
    const jour = this.commandesDuJour(commandes);
    const hier = this.commandesHier(commandes);

    const caJour = this.calculerCA(jour);
    const caHier = this.calculerCA(hier);
    const elCA = document.getElementById('kpi-ca');
    elCA.textContent = caJour.toFixed(2) + ' ' + CONFIG.DEVISE;
    elCA.classList.add('kpi-update');
    setTimeout(() => elCA.classList.remove('kpi-update'), 400);

    const elEvo = document.getElementById('kpi-ca-evolution');
    if (caHier > 0) {
      const pct = ((caJour - caHier) / caHier * 100).toFixed(1);
      const isUp = pct >= 0;
      elEvo.textContent = (isUp ? '▲ +' : '▼ ') + pct + '% vs hier';
      elEvo.className = 'text-sm mt-1 ' + (isUp ? 'text-green-600' : 'text-red-500');
    } else {
      elEvo.textContent = 'Pas de données hier';
      elEvo.className = 'text-sm mt-1 text-gray-400';
    }

    const marge = this.calculerMargeMoyenne(jour, produits);
    const elMarge = document.getElementById('kpi-marge');
    elMarge.textContent = marge.toFixed(1) + '%';
    elMarge.classList.add('kpi-update');
    setTimeout(() => elMarge.classList.remove('kpi-update'), 400);

    const idsUniques = new Set(jour.map(c => c['ID commande']));
    const elCmd = document.getElementById('kpi-commandes');
    elCmd.textContent = idsUniques.size;
    elCmd.classList.add('kpi-update');
    setTimeout(() => elCmd.classList.remove('kpi-update'), 400);
  },
};
