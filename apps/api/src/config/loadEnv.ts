import path from "node:path";
import { config } from "dotenv";

// Output build adalah CommonJS (package.json tanpa "type": "module"), jadi pakai __dirname,
// bukan import.meta.url. Kedalaman folder sama: src/config -> apps/api/.env, dist/config -> apps/api/.env.
config({ path: path.resolve(__dirname, "../../.env") });
