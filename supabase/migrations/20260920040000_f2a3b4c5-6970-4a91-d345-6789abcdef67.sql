-- Cada usuário passa a ter seu próprio app na Pluggy (clientId/clientSecret
-- próprios), em vez de todos dependerem das credenciais globais do dono da
-- conta — isso é o que permite abrir a integração bancária pra qualquer
-- usuário, não só pra quem configurou o .env original.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pluggy_client_id text,
  ADD COLUMN IF NOT EXISTS pluggy_client_secret text;
