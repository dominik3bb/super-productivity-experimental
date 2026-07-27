/** Max history entries kept per task (newest retained). */
export const TASK_HISTORY_MAX_ENTRIES = 20;

/**
 * Rapid title/notes commits within this window coalesce onto the first capture
 * so History does not fill with intermediate keystroke-adjacent saves.
 */
export const TASK_HISTORY_DEBOUNCE_MS = 2_000;
