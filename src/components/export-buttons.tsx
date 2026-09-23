"use client";

export function ExportButtons({ filename, rows }: { filename: string; rows: Record<string, string | number>[] }) {
  function toCsv() {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map((row) => headers.map((h) => `"${String(row[h]).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    download(csv, `${filename}.csv`, "text/csv");
  }

  function toExcel() {
    // Excel-friendly TSV that opens in Excel
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const tsv = [
      headers.join("\t"),
      ...rows.map((row) => headers.map((h) => String(row[h])).join("\t")),
    ].join("\n");
    download(tsv, `${filename}.xls`, "application/vnd.ms-excel");
  }

  function toPdf() {
    const html = `
      <html><head><title>${filename}</title>
      <style>body{font-family:sans-serif;padding:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#f1f5f9}</style>
      </head><body>
      <h1>${filename}</h1>
      <table><thead><tr>${Object.keys(rows[0] || {}).map((h) => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((row) => `<tr>${Object.values(row).map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}</tbody></table>
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  function download(content: string, name: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button onClick={toCsv} className="rounded-xl border border-border px-3 py-1.5 text-sm hover:bg-muted">Export CSV</button>
      <button onClick={toExcel} className="rounded-xl border border-border px-3 py-1.5 text-sm hover:bg-muted">Export Excel</button>
      <button onClick={toPdf} className="rounded-xl border border-border px-3 py-1.5 text-sm hover:bg-muted">Export PDF</button>
    </div>
  );
}
