const PdfExport = {
  generer(commandes, produits) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    const { debut, fin } = TvaMarge.getDateRange();
    const lignes = TvaMarge.calculer(commandes, produits, debut, fin);

    if (lignes.length === 0) {
      alert('Aucune donnée sur cette période.');
      return;
    }

    const fmt = (n) => n.toFixed(2) + ' ' + CONFIG.DEVISE;
    const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    doc.setFontSize(18);
    doc.setTextColor(37, 99, 235);
    doc.text('ChronoMax — Rapport TVA sur marge', 14, 20);

    doc.setFontSize(11);
    doc.setTextColor(100, 100, 100);
    doc.text(`Période : du ${fmtDate(debut)} au ${fmtDate(fin)}`, 14, 28);
    doc.text(`Généré le : ${new Date().toLocaleDateString('fr-FR')}`, 14, 34);

    const tableData = lignes.map(l => [
      fmtDate(l.date), fmt(l.caHT), fmt(l.coutTotal), fmt(l.margeBrute), fmt(l.tvaMarge), fmt(l.margeNette),
    ]);

    const totaux = lignes.reduce((acc, l) => ({
      caHT: acc.caHT + l.caHT, coutTotal: acc.coutTotal + l.coutTotal,
      margeBrute: acc.margeBrute + l.margeBrute, tvaMarge: acc.tvaMarge + l.tvaMarge, margeNette: acc.margeNette + l.margeNette,
    }), { caHT: 0, coutTotal: 0, margeBrute: 0, tvaMarge: 0, margeNette: 0 });

    tableData.push(['TOTAL', fmt(totaux.caHT), fmt(totaux.coutTotal), fmt(totaux.margeBrute), fmt(totaux.tvaMarge), fmt(totaux.margeNette)]);

    doc.autoTable({
      startY: 40,
      head: [['Date', 'CA HT', 'Coût total', 'Marge brute', 'TVA sur marge', 'Marge nette']],
      body: tableData,
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255 },
      didParseCell: function(data) {
        if (data.row.index === tableData.length - 1 && data.section === 'body') {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [243, 244, 246];
        }
      },
      columnStyles: {
        0: { halign: 'left' },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
      },
    });

    const nomFichier = `ChronoMax_TVA_Marge_${debut}_${fin}.pdf`;
    doc.save(nomFichier);
  },
};

function exportPDF() {
  if (window._lastCommandes && window._lastProduits) {
    PdfExport.generer(window._lastCommandes, window._lastProduits);
  } else {
    alert('Données non chargées. Veuillez patienter.');
  }
}
