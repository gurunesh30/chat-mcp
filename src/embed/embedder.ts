/**
 * embedder.ts
 *
 * Thin wrapper around @xenova/transformers that produces dense float32
 * embedding vectors for arbitrary text strings.
 *
 * Model: Xenova/all-MiniLM-L6-v2  (384-dim, runs fully offline)
 * Weights are downloaded to node_modules cache on first run and reused
 * afterwards — no API key or network access required after that.
 */

// @xenova/transformers is ESM-only; the `pipeline` function is the main entry.
// We use a dynamic import so TypeScript compiles cleanly under NodeNext.
import { config } from "../config.js";

// ---------------------------------------------------------------------------
// Internal singleton
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pipe: ((texts: string | string[], opts: Record<string, unknown>) => Promise<any>) | null = null;

async function getPipeline() {
  if (_pipe) return _pipe;

  // Dynamic import keeps the heavy transformers bundle out of the
  // initial module parse graph.
  const { pipeline, env } = await import("@xenova/transformers");

  // Tell Xenova to store cached model weights in node_modules/.cache/xenova
  // rather than the user's home directory.
  env.cacheDir = "./node_modules/.cache/xenova";
  // Disable local model lookup (always download / use hub cache)
  env.allowLocalModels = false;

  _pipe = await pipeline("feature-extraction", config.embeddingModel, {
    // quantized=true uses int8 ONNX weights (~4× smaller, negligible quality loss)
    quantized: true,
  });

  return _pipe;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Embed a single string into a Float32Array of length `config.vectorDimensions`.
 *
 * The result is mean-pooled across token positions and L2-normalised so that
 * cosine similarity == dot product, which matches LanceDB's default metric.
 */
export async function embedText(text: string): Promise<Float32Array> {
  const pipe = await getPipeline();

  // mean_pooling + normalize gives a unit-norm sentence embedding
  const output = await pipe(text, { pooling: "mean", normalize: true });

  // Xenova returns a Tensor; .data is a Float32Array
  return output.data as Float32Array;
}

/**
 * Embed a batch of strings in one forward pass.
 * More efficient than calling embedText() in a loop for large batches.
 *
 * Returns an array of Float32Array, one per input string.
 */
export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];

  const pipe = await getPipeline();
  const output = await pipe(texts, { pooling: "mean", normalize: true });

  // output.data is a flat Float32Array of shape [batch, dims]
  const dims = config.vectorDimensions;
  const flat = output.data as Float32Array;
  const results: Float32Array[] = [];

  for (let i = 0; i < texts.length; i++) {
    results.push(flat.slice(i * dims, (i + 1) * dims));
  }

  return results;
}

/**
 * Warm up the embedding pipeline by loading model weights.
 * Call once at server startup so the first real request isn't slow.
 */
export async function warmupEmbedder(): Promise<void> {
  await getPipeline();
}
