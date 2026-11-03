// Every section's style.css, bundled after base styles (see base-entry.js).
// Kept in its own module because import.meta.glob imports are hoisted.
import.meta.glob("../sections/*/style.css", { eager: true });
