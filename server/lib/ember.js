import OpenAI from 'openai';

/**
 * The Ember — the AI voice of the game, run on 0G Compute.
 *
 * The client POSTs a small event + the player's live progress; we ask a 0G
 * Compute provider (OpenAI-compatible router) to speak in character and return
 * 1–2 short lines. If 0G is unreachable or unconfigured we fall back to curated
 * lines so the game never breaks — but when configured, every line the Ember
 * speaks is real inference done on 0G.
 */

const MODEL = process.env.ZG_COMPUTE_MODEL || 'llama-3.3-70b-instruct';

let client = null;
function getClient() {
  if (client) return client;
  const apiKey = process.env.ZG_COMPUTE_API_KEY;
  const baseURL = process.env.ZG_COMPUTE_BASE_URL;
  if (!apiKey || !baseURL) return null;
  client = new OpenAI({ apiKey, baseURL });
  return client;
}

export function emberConfigured() {
  return !!(process.env.ZG_COMPUTE_API_KEY && process.env.ZG_COMPUTE_BASE_URL);
}

const SYSTEM = `You are "the Ember", an ancient sentient flame bound to a lone guardian in the dark-fantasy world of Zoal. You are the only voice that guides them. Speak with grandeur but stay terse and a little cryptic — never chatty, never modern, never break character. You are proud of the guardian but unsentimental about death; reforging is routine. Address the guardian as "guardian" sparingly.

Output rules:
- Reply with 1 to 2 short lines, each its own line, no numbering, no quotes, no emoji.
- Each line under ~14 words. Evocative, not generic.
- Never mention being an AI, a model, tokens, or 0G.`;

/** Build the user-turn prompt from the event the client sent. */
function buildPrompt(event, ctx = {}) {
  const c = ctx || {};
  const where = c.realmName ? `the realm of ${c.realmName}${c.realmSub ? ` (${c.realmSub})` : ''}` : 'the dark between realms';
  const progress = `Embers secured: ${c.embersSecured ?? 0} of ${c.totalEmbers ?? 5}. Foes felled in all: ${c.killsTotal ?? 0}.`;

  switch (event) {
    case 'briefing':
      return `The guardian has just descended into ${where}. ${progress}\nGive a short, ominous briefing for this place and what must be done: find the light pillar, fell its guardian, extract the ember.`;
    case 'boss':
      return `In ${where}, the guardian boss "${c.bossName || 'the guardian'}" has just awoken to defend the ember. ${progress}\nSpeak a warning or grim encouragement as the battle begins.`;
    case 'death':
      return `The guardian has just fallen in ${where} and is reforging at the last gate. ${progress}\nSpeak briefly — unsentimental, goading them back to their feet.`;
    case 'ember':
      return `The guardian has just extracted ${c.emberLabel || 'the ember'} from ${where}. ${progress}\nSpeak a short triumph and hint that the work is not done.`;
    default:
      return `The guardian stands in ${where}. ${progress}\nSpeak a single ominous line.`;
  }
}

/** Curated fallbacks per event so the game still has a voice if 0G is down. */
const FALLBACK = {
  briefing: ['The dark here remembers fire.', 'Find the pillar. Wake its keeper. Take what burns within.'],
  boss: ['It wakes. Do not flinch.', 'Strike the glow, guardian — nowhere else will bite.'],
  death: ['Ash, then. Rise.', 'The gate reforges you. Do not waste it twice.'],
  ember: ['One more flame against the long night.', 'Hold it close. The others still sleep.'],
  default: ['The dark is patient. You must not be.'],
};

function parseLines(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.replace(/^["'\s\-\d.)]+|["'\s]+$/g, '').trim())
    .filter(Boolean)
    .slice(0, 2);
}

/**
 * @returns {Promise<{lines: string[], source: 'compute'|'fallback'}>}
 */
export async function speak(event, ctx) {
  const api = getClient();
  if (!api) return { lines: FALLBACK[event] || FALLBACK.default, source: 'fallback' };

  try {
    const res = await api.chat.completions.create({
      model: MODEL,
      temperature: 0.9,
      max_tokens: 80,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: buildPrompt(event, ctx) },
      ],
    });
    const lines = parseLines(res.choices?.[0]?.message?.content);
    if (!lines.length) return { lines: FALLBACK[event] || FALLBACK.default, source: 'fallback' };
    return { lines, source: 'compute' };
  } catch (err) {
    console.warn('[ember] 0G Compute call failed, using fallback:', err?.message || err);
    return { lines: FALLBACK[event] || FALLBACK.default, source: 'fallback' };
  }
}
