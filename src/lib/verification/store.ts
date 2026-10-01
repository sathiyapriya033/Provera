import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { RECORD_ID_PATTERN, createRecordId, type VerificationRecord } from "./record";

/**
 * Provera — verification-record persistence (Phase4).
 *
 * Approach: one JSON file per record under `<cwd>/data/records/`.
 * This is deliberately the simplest durable mechanism for the MVP: no
 * database, no external service, no extra environment variables.
 *
 * Documented limitations (also recorded in docs/VERIFICATION_MODEL.md):
 * - Records live on the local filesystem of the machine running the server:
 *   they survive server restarts but NOT container/host rebuilds or moves.
 * - Single-instance only: no cross-instance replication or locking.
 * - The store is not tamper-proof; the recordHash makes undetected edits
 *   detectable, not impossible.
 * - `data/` is git-ignored; records are never committed.
 */

const RECORDS_DIR = path.join(process.cwd(), "data", "records");

export class VerificationStoreError extends Error {
  readonly code: "PERSISTENCE_FAILED" | "RECORD_NOT_FOUND";

  constructor(code: "PERSISTENCE_FAILED" | "RECORD_NOT_FOUND", message: string) {
    super(message);
    this.name = "VerificationStoreError";
    this.code = code;
  }
}

function recordPath(recordId: string): string {
  return path.join(RECORDS_DIR, `${recordId}.json`);
}

const MAX_ID_ATTEMPTS = 5;

/**
 * Allocates a record ID that is not already present in the store. The random
 * body makes collisions improbable; this check makes them impossible to
 * persist silently.
 */
export async function allocateRecordId(): Promise<string> {
  for (let attempt = 0; attempt < MAX_ID_ATTEMPTS; attempt += 1) {
    const candidate = createRecordId();
    if (!(await recordExists(candidate))) return candidate;
  }
  throw new VerificationStoreError(
    "PERSISTENCE_FAILED",
    `Could not allocate a unique record ID after ${MAX_ID_ATTEMPTS} attempts.`,
  );
}

/** True when a record with this ID already exists in the store. */
export async function recordExists(recordId: string): Promise<boolean> {
  if (!RECORD_ID_PATTERN.test(recordId)) return false;
  try {
    await readFile(recordPath(recordId), "utf8");
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw new VerificationStoreError(
      "PERSISTENCE_FAILED",
      `Could not read the record store: ${(error as Error).message}`,
    );
  }
}

/**
 * Persists a record atomically (write to a temp file, then rename) so a
 * crash cannot leave a half-written record under the final name.
 */
export async function saveRecord(record: VerificationRecord): Promise<void> {
  const target = recordPath(record.recordId);
  const temp = `${target}.${process.pid}.tmp`;
  try {
    await mkdir(RECORDS_DIR, { recursive: true });
    await writeFile(temp, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    await rename(temp, target);
  } catch (error) {
    await unlink(temp).catch(() => undefined);
    throw new VerificationStoreError(
      "PERSISTENCE_FAILED",
      `Could not persist record ${record.recordId}: ${(error as Error).message}`,
    );
  }
}

/** Removes a record (used only for rollback if metadata attachment fails). */
export async function deleteRecord(recordId: string): Promise<void> {
  try {
    await unlink(recordPath(recordId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw new VerificationStoreError(
      "PERSISTENCE_FAILED",
      `Could not roll back record ${recordId}: ${(error as Error).message}`,
    );
  }
}

/** Retrieves a record by ID. Throws RECORD_NOT_FOUND when it is absent. */
export async function getRecord(recordId: string): Promise<VerificationRecord> {
  if (!RECORD_ID_PATTERN.test(recordId)) {
    throw new VerificationStoreError(
      "RECORD_NOT_FOUND",
      `"${recordId}" is not a valid Provera record ID (expected PV-YYYY-XXXXXXXX).`,
    );
  }
  try {
    const raw = await readFile(recordPath(recordId), "utf8");
    return JSON.parse(raw) as VerificationRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new VerificationStoreError(
        "RECORD_NOT_FOUND",
        `No verification record with ID ${recordId}.`,
      );
    }
    if (error instanceof SyntaxError) {
      throw new VerificationStoreError(
        "PERSISTENCE_FAILED",
        `Stored record ${recordId} is not valid JSON.`,
      );
    }
    throw new VerificationStoreError(
      "PERSISTENCE_FAILED",
      `Could not read record ${recordId}: ${(error as Error).message}`,
    );
  }
}
