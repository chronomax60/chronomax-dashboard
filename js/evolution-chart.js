const EvolutionChart = {
  chart: null,
  currentPeriod: 'semaine',

  agreger(commandes, period) {
    const now = new Date();
    const nbJours = period === 'semaine' ? 7 : 30;
    const jours = {};

    for (let i = nbJours - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      jours[key] = 0;
    }

    commandes.forEach(c => {
      const date = (c['Date/Heure'] || '').slice(0, 10);
      if (date in jours) {
        jours[date] += parseFloat(c['Total HT'] || 0);
      }
    });

    const entries = Object.entries(jours).sort((a, b) => a[0].localeCompare(b[0]));
    const labels = entries.map(([date]) => {
      const d = new Date(date);
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    });
    const values = entries.map(([, val]) => val);
    return { labels, values };
  },

  render(commandes) {
    const { labels, values } = this.agreger(commandes, this.currentPeriod);
    const ctx = document.getElementById('chart-evolution').getContext('2d');

    if (this.chart) {
      this.chart.data.labels = labels;
      this.chart.data.datasets[0].data = values;
      this.chart.update('none');
      return;
    }

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'CA HT (€)',
          data: values,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: '#2563eb',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { callback: (val) => val + ' €' },
          },
        },
      },
    });
  },

  setPeriod(period, commandes) {
    this.currentPeriod = period;
    const btnSemaine = document.getElementById('btn-semaine');
    const btnMois = document.getElementById('btn-mois');
    if (period === 'semaine') {
      btnSemaine.className = 'px-3 py-1 text-sm rounded-lg bg-brand-blue text-white';
      btnMois.className = 'px-3 py-1 text-sm rounded-lg bg-gray-100 text-gray-600';
    } else {
      btnSemaine.className = 'px-3 py-1 text-sm rounded-lg bg-gray-100 text-gray-600';
      btnMois.className = 'px-3 py-1 text-sm rounded-lg bg-brand-blue text-white';
    }
    this.render(commandes);
  },
};

function setEvolutionPeriod(period) {
  EvolutionChart.setPeriod(period, window._lastCommandes || []);
}
