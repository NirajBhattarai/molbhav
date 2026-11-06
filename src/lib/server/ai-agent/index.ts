import "server-only";

/*
 * Agents' AI (Gemini): stall shopkeeper wording/price-pick, and buyer shopper wording.
 * Floor / budget never go in the prompt. Null when Gemini is off, slow, or rate-limited —
 * callers fall back to catalog notes + decideStallCounter / strategy prices.
 */

export { pricesIn, type Speak, type Spoken, type Turn } from "@/lib/server/ai-agent/shared";

export {
  stallThinks,
  stallWelcomes,
  type StallMove,
  type StallRound,
} from "@/lib/server/ai-agent/stall";

export { shopperSays, type ShopperTurn } from "@/lib/server/ai-agent/shopper";
