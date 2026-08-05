"""JD-similarity primitives (ported from scripts/merge_duplicates.py).

Jaccard overlap on word sets — the duplicate-detection signal behind the repost
popover's "N% match". Stdlib only, and once stop words and short tokens are dropped
the score reflects meaningful, role-specific vocabulary. Purely lexical, unifying no
synonyms or morphological variants, which suits recruiter reposts (copy-pasted JDs
score 1.00); a genuinely rewritten repost may under-score, the accepted trade for
zero dependencies and a cheap synchronous read.
"""

import re

# The `len > 3` filter still passes common 3-letter stop words (and, are, the), and
# every English JD shares hundreds of those, inflating Jaccard until different roles
# look similar. This list removes that noise.
_STOP = {
    "the",
    "and",
    "for",
    "are",
    "not",
    "but",
    "was",
    "you",
    "all",
    "our",
    "its",
    "has",
    "had",
    "can",
    "been",
    "have",
    "will",
    "with",
    "this",
    "that",
    "they",
    "from",
    "your",
    "their",
    "more",
    "also",
    "some",
    "into",
    "than",
    "then",
    "when",
    "who",
    "what",
    "how",
    "each",
    "both",
    "very",
    "just",
    "over",
    "such",
    "like",
    "may",
    "any",
    "one",
    "two",
    "new",
    "get",
    "use",
    "per",
    "via",
    "etc",
    "i.e",
    "e.g",
    "n/a",
    "n.a",
    "tbd",
    "able",
    "well",
    "make",
    "take",
    "give",
    "come",
    "about",
    "these",
    "those",
    "which",
    "there",
    "where",
    "other",
    "after",
    "would",
    "could",
    "should",
    "being",
    "doing",
    "team",
    "work",
    "role",
    "join",
    "help",
    "want",
    "need",
    "good",
    "great",
    "strong",
    "high",
    "key",
    "top",
    "part",
    "wide",
    "long",
    "full",
    "open",
    "big",
    "own",
    "way",
}


def tokenize(text: str | None) -> set[str]:
    """Content-word set for a JD: strip HTML tags, lowercase, keep alphanumeric
    words longer than three chars that aren't stop words. Empty/None → empty set."""
    if not text:
        return set()
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return {w for w in text.split() if len(w) > 3 and w not in _STOP}


def jaccard(a: set[str], b: set[str]) -> float:
    """|A intersect B| / |A union B|. Two empty sets are trivially identical (1.0);
    one empty against a non-empty set shares nothing (0.0)."""
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)
