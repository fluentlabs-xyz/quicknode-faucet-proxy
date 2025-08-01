import { validateParaJwt } from "../src/jwt.ts";

const [token] = process.argv.slice(2);

if (!token) {
  console.error("Usage: bun run script/verify-jwt.ts <jwt>");
  process.exit(1);
}

const result = await validateParaJwt(token);

if (result.valid) {
  console.log("JWT is valid.");
  console.log("Decoded payload:", result.payload);
  process.exit(0);
} else {
  console.error("Invalid JWT:", result.error);
  process.exit(2);
}
