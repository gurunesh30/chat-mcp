import path from "node:path";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Environment schema — every variable is optional with a sensible default so
// the server can start without a .env file for development.
// ---------------------------------------------------------------------------

const EnvSchema = z.object({
  /** Absolute or relative path to the LanceDB storage directory */
  LANCEDB_PATH: z.string().default("./storage/lancedb"),

  /** Directory watched for incoming chat export files */
  EXPORTS_DIR: z.string().default("./exports"),

  /** Maximum search results returned per query */
  SEARCH_TOP_K: z.coerce.number().int().positive().default(10),

  /**
   * Local embedding model name (Xenova/transformers hub ID).
   * all-MiniLM-L6-v2 produces 384-dim vectors and runs fully offline.
   */
  EMBEDDING_MODEL: z.string().default("Xenova/all-MiniLM-L6-v2"),

  /**
   * Dimensionality of the embedding vectors stored in LanceDB.
   * Must match the model output size.
   * 384 matches all-MiniLM-L6-v2; change alongside EMBEDDING_MODEL if swapped.
   */
  VECTOR_DIMENSIONS: z.coerce.number().int().positive().default(384),

  /** Minimum verbosity level for structured log output */
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  /** Node environment — used for conditional logging behaviour */
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

// ---------------------------------------------------------------------------
// Parse & validate — throws at startup if a required value is missing/invalid
// ---------------------------------------------------------------------------

function loadConfig() {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }

  const env = result.data;

  return {
    lancedbPath: path.resolve(env.LANCEDB_PATH),
    exportsDir: path.resolve(env.EXPORTS_DIR),
    searchTopK: env.SEARCH_TOP_K,
    embeddingModel: env.EMBEDDING_MODEL,
    vectorDimensions: env.VECTOR_DIMENSIONS,
    logLevel: env.LOG_LEVEL,
    isDev: env.NODE_ENV === "development",
    isTest: env.NODE_ENV === "test",
  } as const;
}

// Single shared config instance — evaluated once on first import.
export const config = loadConfig();

export type Config = typeof config;
