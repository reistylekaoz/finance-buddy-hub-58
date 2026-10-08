const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

// Competência da fatura: se a compra caiu depois do fechamento, ela entra na
// fatura do mês seguinte. Vencimento cai no mesmo mês da competência quando o
// dia de vencimento é depois do fechamento; senão, no mês seguinte (convenção
// usual dos bancos: fecha, aí só depois vence). Compartilhado entre a tela de
// Cartões e o painel de gastos de cartão no Dashboard.
export function invoiceInfo(purchaseDate: string, closingDay: number, dueDay: number) {
  const d = new Date(`${purchaseDate}T12:00:00`);
  let month = d.getMonth();
  let year = d.getFullYear();
  if (d.getDate() > closingDay) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  let dueMonth = month;
  let dueYear = year;
  if (dueDay <= closingDay) {
    dueMonth += 1;
    if (dueMonth > 11) {
      dueMonth = 0;
      dueYear += 1;
    }
  }
  const key = `${year}-${String(month + 1).padStart(2, "0")}`;
  const dueDate = `${dueYear}-${String(dueMonth + 1).padStart(2, "0")}-${String(dueDay).padStart(2, "0")}`;
  return { key, label: `${MONTH_NAMES[month]}/${year}`, dueDate };
}
