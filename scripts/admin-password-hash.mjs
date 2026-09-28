// Genera el valor de ADMIN_PASSWORD_HASH para el panel /admin.
// Uso: node scripts/admin-password-hash.mjs   (pide la contraseña sin mostrarla)
import { randomBytes, scryptSync } from "node:crypto";
import { createInterface } from "node:readline";

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
rl._writeToOutput = (text) => {
  if (text.includes("Contraseña")) process.stdout.write(text);
};

rl.question("Contraseña del panel admin: ", (password) => {
  rl.close();
  process.stdout.write("\n");

  if (password.length < 12) {
    console.error("Usá al menos 12 caracteres.");
    process.exit(1);
  }

  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  console.log(`scrypt:${salt.toString("base64url")}:${hash.toString("base64url")}`);
});
