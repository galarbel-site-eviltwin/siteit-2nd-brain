import { anthropic } from "@ai-sdk/anthropic";

// Claude straight from Anthropic with the company key (ANTHROPIC_API_KEY).
export const CHAT_MODEL = anthropic("claude-sonnet-5-5");

// Vectors need an embeddings provider, which Anthropic does not offer. Until one is chosen
// (AI_EMBED_MODEL, e.g. through AI Gateway), search runs on words only and still works.
export const EMBED_MODEL = process.env.AI_EMBED_MODEL || null;
