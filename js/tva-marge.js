const TvaMarge = {
  initSelectors() {
    const selectMois = document.getElementById('tva-mois');
    const selectAnnee = document.getElementById('tva-annee');
    const now = new Date();

    const moisNoms = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    selectMois.innerHTML = moisNoms.map((nom, i) =>
      `<option value="${i}" ${i === now.getMonth() ? 'selected' : ''}>${nom}</option>`
    ).join('');

    const currentYear = now.getFullYear();
    selectAnnee.innerHTML = [currentYear - 2, currentYear - 1, currentYear].map(y =>
      `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`
    ).join('');
  },

  getDateRange() {
    const mode = document.getElementById('tva-mode').value;
    if (mode === 'libre') {
      return {
        debut: document.getElementById('tva-date-debut').value,
        fin: document.getElementById('tva-date-fin').value,
      };
    }
    const annee = parseInt(document.getElementById('tva-annee').value);
    if (mode === 'annee') {
      return { debut: `${annee}-01-01`, fin: `${annee}-12-31` };
    }
    const mois = parseInt(document.getElementById('tva-mois').value);
    const dernierJour = new Date(annee, mois + 1, 0).getDate();
    const mm = String(mois + 1).padStart(2, '0');
    return {
      debut: `${annee}-${mm}-01`,
      fin: `${annee}-${mm}-${String(dernierJour).padStart(2, '0')}`,
    };
  },

  calculer(commandes, produits, debut, fin) {
    const coutMap = {};
    produits.forEach(p => {
      coutMap[p['Nom']] = parseFloat(p['Coût revient HT'] || 0);
    });

    const parJour = {};
    commandes.forEach(c => {
      const date = (c['Date/Heure'] || '').slice(0, 10);
      if (date < debut || date > fin) return;
      if (!parJour[date]) parJour[date] = { caHT: 0, coutTotal: 0 };
      const totalHT = parseFloat(c['Total HT'] || 0);
      const quantite = parseFloat(c['Quantité'] || 1);
      const coutUnitaire = coutMap[c['Produit']] || 0;
      parJour[date].caHT += totalHT;
      parJour[date].coutTotal += coutUnitaire * quantite;
    });

    return Object.entries(parJour)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, data]) => {
        const margeBrute = data.caHT - data.coutTotal;
        const tvaMarge = margeBrute * CONFIG.TVA_MARGE_TAUX;
        const margeNette = margeBrute - tvaMarge;
        return { date, caHT: data.caHT, coutTotal: data.coutTotal, margeBrute, tvaMarge, margeNette };
      });
  },

  render(commandes, produits) {
    const { debut, fin } = this.getDateRange();
    const lignes = this.calculer(commandes, produits, debut, fin);
    const tbody = document.getElementById('tva-body');
    const tfoot = document.getElementById('tva-footer');

    if (lignes.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="py-4 text-center text-gray-400">Aucune donnée sur cette période</td></tr>';
      tfoot.innerHTML = '';
      return;
    }

    const fmt = (n) => n.toFixed(2) + ' ' + CONFIG.DEVISE;
    const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    tbody.innerHTML = lignes.map(l => `
      <tr class="border-b border-gray-100 hover:bg-gray-50">
        <td class="py-2 pr-4">${fmtDate(l.date)}</td>
        <td class="py-2 pr-4 text-right">${fmt(l.caHT)}</td>
        <td class="py-2 pr-4 text-right">${fmt(l.coutTotal)}</td>
        <td class="py-2 pr-4 text-right">${fmt(l.margeBrute)}</td>
        <td class="py-2 pr-4 text-right">${fmt(l.tvaMarge)}</td>
        <td class="py-2 text-right">${fmt(l.margeNette)}</td>
      </tr>
    `).join('');

    const totaux = lignes.reduce((acc, l) => ({
      caHT: acc.caHT + l.caHT,
      coutTotal: acc.coutTotal + l.coutTotal,
      margeBrute: acc.margeBrute + l.margeBrute,
      tvaMarge: acc.tvaMarge + l.tvaMarge,
      margeNette: acc.margeNette + l.margeNette,
    }), { caHT: 0, coutTotal: 0, margeBrute: 0, tvaMarge: 0, margeNette: 0 });

    tfoot.innerHTML = `
      <tr>
        <td class="py-2 pr-4">TOTAL</td>
        <td class="py-2 pr-4 text-right">${fmt(totaux.caHT)}</td>
        <td class="py-2 pr-4 text-right">${fmt(totaux.coutTotal)}</td>
        <td class="py-2 pr-4 text-right">${fmt(totaux.margeBrute)}</td>
        <td class="py-2 pr-4 text-right">${fmt(totaux.tvaMarge)}</td>
        <td class="py-2 text-right">${fmt(totaux.margeNette)}</td>
      </tr>
    `;
  },
};

function onTvaModeChange() {
  const mode = document.getElementById('tva-mode').value;
  const selectMois = document.getElementById('tva-mois');
  const selectAnnee = document.getElementById('tva-annee');
  const dateDebut = document.getElementById('tva-date-debut');
  const dateFin = document.getElementById('tva-date-fin');

  if (mode === 'libre') {
    selectMois.classList.add('hidden');
    dateDebut.classList.remove('hidden');
    dateFin.classList.remove('hidden');
  } else if (mode === 'annee') {
    selectMois.classList.add('hidden');
    dateDebut.classList.add('hidden');
    dateFin.classList.add('hidden');
  } else {
    selectMois.classList.remove('hidden');
    dateDebut.classList.add('hidden');
    dateFin.classList.add('hidden');
  }

  if (window._lastCommandes && window._lastProduits) {
    TvaMarge.render(window._lastCommandes, window._lastProduits);
  }
}
