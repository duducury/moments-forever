/**
 * Display-only split of a place's story into an editorial headline and a body, for the "Sobre essa viagem" section.
 * The stored text is never changed. Rules, in order:
 *  1. a first line (text before a line break) is the headline;
 *  2. otherwise the first sentence is the headline when it is short (<= 70 chars) and more text follows;
 *  3. otherwise the first comma clause when it is short (<= 60 chars) and more text follows;
 *  4. a short story (<= 70 chars) without any split is a headline on its own;
 *  5. anything else has no headline (the whole text is the body).
 * The last two words of a headline (the last word if it has fewer than 3) are returned as `accent` (copper in the UI).
 */
export interface StoryHeadline {
  readonly lead: string;
  readonly accent: string;
  readonly body: string;
}

const MAX_SENTENCE = 70;
const MAX_CLAUSE = 60;

function trimTail(value: string): string {
  return value.replace(/[\s.,;:!?-]+$/u, "").trim();
}

function withAccent(headline: string, body: string): StoryHeadline {
  const words = headline.split(/\s+/u).filter(Boolean);
  const accentCount = words.length >= 3 ? 2 : 1;
  return {
    lead: words.slice(0, words.length - accentCount).join(" "),
    accent: words.slice(words.length - accentCount).join(" "),
    body: body.trim(),
  };
}

export function splitStoryHeadline(story: string): StoryHeadline | null {
  const text = story.trim();
  if (!text) return null;

  const newline = text.search(/\r?\n/u);
  if (newline > 0) {
    const first = trimTail(text.slice(0, newline));
    if (first) return withAccent(first, text.slice(newline));
  }

  const sentence = /[.!?](\s|$)/u.exec(text);
  if (sentence && sentence.index <= MAX_SENTENCE) {
    const first = trimTail(text.slice(0, sentence.index));
    const rest = text.slice(sentence.index + 1);
    if (first && rest.trim()) return withAccent(first, rest);
  }

  const comma = text.indexOf(",");
  if (comma > 0 && comma <= MAX_CLAUSE) {
    const first = trimTail(text.slice(0, comma));
    const rest = text.slice(comma + 1);
    if (first && rest.trim()) return withAccent(first, rest);
  }

  if (text.length <= MAX_SENTENCE) {
    const only = trimTail(text);
    if (only) return withAccent(only, "");
  }
  return null;
}
