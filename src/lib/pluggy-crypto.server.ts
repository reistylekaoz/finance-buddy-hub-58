// Criptografia em repouso do client_secret da Pluggy (AES-256-GCM).
//
// O risco principal (leitura via navegador) já é bloqueado pela ausência
// de qualquer policy de RLS para anon/authenticated em pluggy_credentials
// — só o service role lê essa tabela. Isso aqui é uma camada extra: mesmo
// um dump direto do banco (backup vazado, acesso ao Lovable Cloud) não
// expõe o secret em texto puro.
//
// Prefixo "v1:" versiona o formato e distingue de segredos legados
// gravados em texto puro antes desta mudança — decryptPluggySecret devolve
// esses valores antigos sem alteração, sem exigir migração de dados.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const VERSION_PREFIX = "v1:";

function getEncryptionKey(): Buffer {
  const hex = process.env["PLUGGY_SECRET_ENCRYPTION_KEY"];
  if (!hex) {
    throw new Error(
      "PLUGGY_SECRET_ENCRYPTION_KEY não configurada: defina uma chave de 64 caracteres hexadecimais (32 bytes) nas variáveis de ambiente do Lovable Cloud.",
    );
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error(
      "PLUGGY_SECRET_ENCRYPTION_KEY inválida: precisa ter 64 caracteres hexadecimais (32 bytes).",
    );
  }
  return key;
}

export function encryptPluggySecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${VERSION_PREFIX}${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

// Segredos gravados antes desta mudança não têm o prefixo "v1:" — devolve
// como texto puro em vez de tentar decifrar, para não quebrar credenciais
// já cadastradas.
export function decryptPluggySecret(stored: string): string {
  if (!stored.startsWith(VERSION_PREFIX)) {
    return stored;
  }
  const [ivB64, authTagB64, ciphertextB64] = stored.slice(VERSION_PREFIX.length).split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Formato inválido de credencial Pluggy criptografada.");
  }
  const key = getEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
