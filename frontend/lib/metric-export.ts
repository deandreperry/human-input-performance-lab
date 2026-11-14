export function csvDownload(name: string, rows: (string | number)[][]) {
  const cell = (v: string | number) => {
    const s =
      typeof v === "string" && /^[\s]*[=+@-]/.test(v) ? "'" + v : String(v);
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const data = rows.map((row) => row.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\ufeff", data], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
