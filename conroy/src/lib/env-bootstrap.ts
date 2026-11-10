// Side-effect import: load .env before any other module reads process.env.
// Import this FIRST in the worker and scripts (Next.js loads .env itself).
import { loadDotEnv } from "./load-env";

loadDotEnv();
