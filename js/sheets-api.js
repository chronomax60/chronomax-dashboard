const SheetsAPI = {
  async fetchSheet(sheetName) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(sheetName)}?key=${CONFIG.GOOGLE_API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Erreur API Sheets (${sheetName}):`, response.status);
      return [];
    }
    const data = await response.json();
    const rows = data.values;
    if (!rows || rows.length < 2) return [];
    const headers = rows[0];
    return rows.slice(1).map(row => {
      const obj = {};
      headers.forEach((header, i) => {
        obj[header] = row[i] || '';
      });
      return obj;
    });
  },

  async fetchAll() {
    const [commandes, produits, tva] = await Promise.all([
      this.fetchSheet(CONFIG.SHEET_COMMANDES),
      this.fetchSheet(CONFIG.SHEET_PRODUITS),
      this.fetchSheet(CONFIG.SHEET_TVA),
    ]);
    return { commandes, produits, tva };
  },
};
