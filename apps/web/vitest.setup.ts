import { config } from "dotenv";
// Load test overrides first (so they win), then fall back to .env.local
config({ path: ".env.test.local" });
config({ path: ".env.local" });
import "@testing-library/jest-dom/vitest";
