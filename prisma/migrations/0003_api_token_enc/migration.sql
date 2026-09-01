-- Зашифрованный plain-токен для повторного показа в UI
ALTER TABLE "ApiToken" ADD COLUMN "tokenEnc" TEXT;
