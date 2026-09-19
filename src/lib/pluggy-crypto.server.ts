// Cifra/decifra o client secret da Pluggy de cada usuário antes de ir para
// profiles.pluggy_client_secret. Sem isso, a coluna guardava o segredo em
// texto puro — protegido só pelo RLS de profiles, ou seja, qualquer acesso
// direto ao banco (backup, dump, um bug futuro de leitura administrativa)
// expunha a credencial que dá acesso às contas bancárias conectadas do
// usuário na Pluggy.
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION_PREFIX = "v1:";

function getKey(): Buffer {
  const hex = process.env["PLUGGY_SECRET_ENCRYPTION_KEY"];
  if (!hex) {
    throw new Error(
      "Chave de criptografia não configurada: defina PLUGGY_SECRET_ENCRYPTION_KEY " +
        "(32 bytes em hex, ex.: `openssl rand -hex 32`) nas variáveis de ambiente do Lovable Cloud.",
    );
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error("PLUGGY_SECRET_ENCRYPTION_KEY precisa ter 32 bytes (64 caracteres hex).");
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return VERSION_PREFIX + [iv, authTag, ciphertext].map((buf) => buf.toString("base64")).join(":");
}

// Dados salvos antes dessa correção ainda estão em texto puro (sem o
// prefixo de versão) — tratados como legado e devolvidos como estão, em vez
// de forçar todo mundo a recadastrar as credenciais da Pluggy. Todo novo
// save já passa por encryptSecret, então isso só existe pra transição.
export function decryptSecret(stored: string): string {
  if (!stored.startsWith(VERSION_PREFIX)) {
    return stored;
  }
  const [ivB64, authTagB64, ciphertextB64] = stored.slice(VERSION_PREFIX.length).split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Credencial da Pluggy corrompida — reconfigure em Configurações.");
  }
  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
