export type Bank = {
  name: string;
  short: string;
  color: string;
  logo?: string;
};

// Bancos com arquivo em public/banks/ usam a logo real; os demais caem no
// selo colorido com a sigla (ver BankBadge em finance-app.tsx).
export const BANKS: Bank[] = [
  { name: "Banco do Brasil", short: "BB", color: "#FFCC29", logo: "/banks/bb.png" },
  { name: "Itaú Unibanco", short: "Itaú", color: "#EC7000", logo: "/banks/itau.png" },
  { name: "Bradesco", short: "Brad", color: "#CC092F", logo: "/banks/bradesco.png" },
  { name: "Santander", short: "Sant", color: "#EC0000", logo: "/banks/santander.png" },
  {
    name: "Caixa Econômica Federal",
    short: "CEF",
    color: "#0033A0",
    logo: "/banks/caixa.jpg",
  },
  { name: "Nubank", short: "Nu", color: "#820AD1", logo: "/banks/nubank.png" },
  { name: "Banco Inter", short: "Inter", color: "#FF7A00", logo: "/banks/inter.png" },
  { name: "C6 Bank", short: "C6", color: "#1B1B1B" },
  { name: "BTG Pactual", short: "BTG", color: "#003399" },
  { name: "Sicoob", short: "Sico", color: "#00A651" },
  { name: "Sicredi", short: "Sicr", color: "#00854A" },
  { name: "Banco Safra", short: "Safra", color: "#003876" },
  { name: "Banco Original", short: "Orig", color: "#00B26B" },
  { name: "Neon", short: "Neon", color: "#00C2FF" },
  { name: "PicPay", short: "Pic", color: "#21C25E" },
  { name: "Mercado Pago", short: "MP", color: "#009EE3" },
  { name: "XP Investimentos", short: "XP", color: "#000000" },
  { name: "Banco Votorantim (BV)", short: "BV", color: "#F58220" },
];

export function bankByName(name: string | null | undefined): Bank | undefined {
  return BANKS.find((b) => b.name === name);
}

export function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}
