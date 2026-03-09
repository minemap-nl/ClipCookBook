/**
 * Smart Timer Parser
 * 
 * Detects time expressions in recipe step text and converts them to milliseconds.
 * Supports:
 * - Numeric times: "15 minuten", "2 hours", "30 sec"
 * - Written-out numbers (EN): "fifteen minutes", "three hours"
 * - Written-out numbers (NL): "twee uur", "vijf minuten"
 * - Compound times: "1 uur en 10 minuten", "2 hours and 15 minutes"
 * - Special Dutch words: "kwartier" (15min), "half uur" (30min), "anderhalf uur" (90min)
 */

// ─── Word-to-number maps ───

const ENGLISH_NUMBERS: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
    fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
    nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
    // Compounds like "twenty-five" or "twentyfive"
};

const DUTCH_NUMBERS: Record<string, number> = {
    nul: 0, een: 1, één: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6,
    zeven: 7, acht: 8, negen: 9, tien: 10, elf: 11, twaalf: 12, dertien: 13,
    veertien: 14, vijftien: 15, zestien: 16, zeventien: 17, achttien: 18,
    negentien: 19, twintig: 20, dertig: 30, veertig: 40, vijftig: 50, zestig: 60,
};

// English tens for compound numbers like "twenty-five"
const ENGLISH_TENS: Record<string, number> = {
    twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
};

// Dutch compound numbers: e.g. "vijfentwintig" = vijf-en-twintig = 25
const DUTCH_TENS_SUFFIX: Record<string, number> = {
    twintig: 20, dertig: 30, veertig: 40, vijftig: 50, zestig: 60,
};

const DUTCH_ONES_PREFIX: Record<string, number> = {
    een: 1, één: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6,
    zeven: 7, acht: 8, negen: 9,
};

/**
 * Parse a written-out number string to its numeric value.
 * Handles English and Dutch, including compounds like "twenty-five", "twentyfive", "vijfentwintig".
 */
function wordToNumber(word: string): number | null {
    const w = word.toLowerCase().trim();

    // Direct lookup
    if (ENGLISH_NUMBERS[w] !== undefined) return ENGLISH_NUMBERS[w];
    if (DUTCH_NUMBERS[w] !== undefined) return DUTCH_NUMBERS[w];

    // English compound: "twenty-five", "twentyfive", "twenty five"
    for (const [tens, tensVal] of Object.entries(ENGLISH_TENS)) {
        if (w.startsWith(tens)) {
            const rest = w.slice(tens.length).replace(/^[-\s]/, '');
            if (rest && ENGLISH_NUMBERS[rest] !== undefined && ENGLISH_NUMBERS[rest] < 10) {
                return tensVal + ENGLISH_NUMBERS[rest];
            }
        }
    }

    // Dutch compound: "vijfentwintig" (vijf + en + twintig)
    for (const [suffix, tensVal] of Object.entries(DUTCH_TENS_SUFFIX)) {
        if (w.endsWith(suffix)) {
            const prefix = w.slice(0, w.length - suffix.length);
            // Remove trailing "ën", "en", or "ën"
            const cleaned = prefix.replace(/[eë]n$/, '');
            if (cleaned && DUTCH_ONES_PREFIX[cleaned] !== undefined) {
                return DUTCH_ONES_PREFIX[cleaned] + tensVal;
            }
        }
    }

    return null;
}

// ─── Time unit keywords ───

const TIME_UNITS_MINUTES: string[] = ['minuten', 'minutes', 'minuut', 'minute', 'mins', 'min'];
const TIME_UNITS_SECONDS: string[] = ['seconden', 'secondes', 'seconds', 'second', 'sec'];
const TIME_UNITS_HOURS: string[] = ['uren', 'hours', 'uur', 'hour', 'hrs', 'hr'];
const TIME_UNITS_DAYS: string[] = ['dagen', 'days', 'dag', 'day'];

function unitToMs(unit: string): number {
    const u = unit.toLowerCase();
    if (TIME_UNITS_SECONDS.some(s => u.startsWith(s.slice(0, 3)))) return 1000;
    if (TIME_UNITS_MINUTES.some(s => u.startsWith(s.slice(0, 3)))) return 60 * 1000;
    if (TIME_UNITS_HOURS.some(s => u.startsWith(s.slice(0, 2)))) return 60 * 60 * 1000;
    if (TIME_UNITS_DAYS.some(s => u.startsWith(s.slice(0, 3)))) return 24 * 60 * 60 * 1000;
    return 60 * 1000; // fallback to minutes
}

function isTimeUnit(word: string): boolean {
    const w = word.toLowerCase();
    return [...TIME_UNITS_MINUTES, ...TIME_UNITS_SECONDS, ...TIME_UNITS_HOURS, ...TIME_UNITS_DAYS]
        .some(u => w === u);
}

// ─── Build all written-out number words for regex ───

function allNumberWords(): string[] {
    const words: string[] = [];

    // English simple
    words.push(...Object.keys(ENGLISH_NUMBERS));

    // Dutch simple
    words.push(...Object.keys(DUTCH_NUMBERS));

    // English compounds: twenty-one through sixty-nine
    for (const tens of Object.keys(ENGLISH_TENS)) {
        for (const ones of Object.keys(ENGLISH_NUMBERS)) {
            if (ENGLISH_NUMBERS[ones] >= 1 && ENGLISH_NUMBERS[ones] <= 9) {
                words.push(`${tens}-${ones}`, `${tens}${ones}`, `${tens} ${ones}`);
            }
        }
    }

    // Dutch compounds: drieëntwintig through negenenvijftig
    for (const suffix of Object.keys(DUTCH_TENS_SUFFIX)) {
        for (const prefix of Object.keys(DUTCH_ONES_PREFIX)) {
            words.push(`${prefix}en${suffix}`, `${prefix}ën${suffix}`);
        }
    }

    // Sort longest first so regex matches greedily
    words.sort((a, b) => b.length - a.length);
    return words;
}

// ─── Regex building ───

const numberWordsPattern = allNumberWords().map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

const unitPattern = [...TIME_UNITS_MINUTES, ...TIME_UNITS_SECONDS, ...TIME_UNITS_HOURS, ...TIME_UNITS_DAYS]
    .sort((a, b) => b.length - a.length)
    .join('|');

// A single number (digit or word)
const digitNumber = `\\d+(?:[.,]\\d+)?`;
const singleNumberPattern = `(?:${digitNumber}|${numberWordsPattern})`;

// Separators for ranges
const rangeSeparator = `\\s*(?:of|or|to|tot|[-–,])\\s*`;

// A sequence of numbers (e.g., "15 of 20", "10, 15")
const numberSequencePattern = `(?:${singleNumberPattern})(?:${rangeSeparator}(?:${singleNumberPattern}))*`;

// A single time segment: number sequence + optional space + unit
const singleTimePattern = `(?:${numberSequencePattern})\\s*(?:${unitPattern})`;

// Special Dutch expressions that are standalone durations
const specialDutchPattern = `(?:anderhalf\\s+uur|half\\s+uur|(?:${numberSequencePattern})\\s+kwartier)`;

// One complete time segment
const oneSegment = `(?:${specialDutchPattern}|${singleTimePattern})`;

// Compound: "1 uur en 10 minuten"
const compoundPattern = `${oneSegment}(?:\\s+(?:en|and)\\s+${oneSegment})*`;

/**
 * Build the regex that splits text into timer and non-timer parts.
 */
export function buildTimerRegex(): RegExp {
    return new RegExp(`(${compoundPattern})`, 'gi');
}

/**
 * Parse a matched time string into total milliseconds.
 * - Handles compound expressions (sum the parts).
 * - Handles ranges (pick the maximum number).
 */
export function parseTimeToMs(timeStr: string): number {
    const lower = timeStr.toLowerCase();

    // Split on " en " or " and " to handle compound times (e.g., "1 hour and 10 minutes")
    const segments = lower.split(/\s+(?:en|and)\s+/);
    let totalMs = 0;

    for (const segment of segments) {
        const trimmed = segment.trim();

        // Special: "anderhalf uur"
        if (trimmed.match(/^anderhalf\s+uur$/)) {
            totalMs += 90 * 60 * 1000;
            continue;
        }

        // Special: "half uur"
        if (trimmed.match(/^half\s+uur$/)) {
            totalMs += 30 * 60 * 1000;
            continue;
        }

        // Handle possible unit at the end
        let unit: string | null = null;
        let numbersPart: string = trimmed;

        // Special case for "kwartier" which often follows the numbers
        if (trimmed.endsWith('kwartier')) {
            unit = 'kwartier';
            numbersPart = trimmed.slice(0, trimmed.length - 'kwartier'.length).trim();
        } else {
            // Find which time unit this segment ends with
            const allUnits = [...TIME_UNITS_MINUTES, ...TIME_UNITS_SECONDS, ...TIME_UNITS_HOURS, ...TIME_UNITS_DAYS]
                .sort((a, b) => b.length - a.length);

            for (const u of allUnits) {
                if (trimmed.endsWith(u)) {
                    unit = u;
                    numbersPart = trimmed.slice(0, trimmed.length - u.length).trim();
                    break;
                }
            }
        }

        if (unit && numbersPart) {
            // Normalize range separators to " to " for easier splitting
            // 1. Handle digit-digit ranges like "10-15" -> "10 to 15"
            // 2. Handle spaced hyphens like "twee - drie" -> "twee to drie"
            const normalizedNumbers = numbersPart
                .replace(/(\d)\s*[-–]\s*(\d)/g, '$1 to $2')
                .replace(/\s+[-–]\s+/g, ' to ');

            const sepRegex = /\s*(?:of|or|to|tot)\s*|,\s+/;
            const numStrings = normalizedNumbers.split(sepRegex).map(s => s.trim()).filter(Boolean);

            let maxVal = 0;
            for (const s of numStrings) {
                const val = parseNumberValue(s);
                if (val !== null && val > maxVal) {
                    maxVal = val;
                }
            }

            if (maxVal > 0) {
                if (unit === 'kwartier') {
                    totalMs += maxVal * 15 * 60 * 1000;
                } else {
                    totalMs += maxVal * unitToMs(unit);
                }
            }
            continue;
        }

        // Final fallback: handle cases like just "kwartier" (though unlikely to match regex without count)
        if (trimmed === 'kwartier') {
            totalMs += 15 * 60 * 1000;
        }
    }

    return totalMs;
}

function parseNumberValue(str: string): number | null {
    const trimmed = str.trim();
    // Try digit
    const digitMatch = trimmed.match(/^(\d+(?:[.,]\d+)?)$/);
    if (digitMatch) {
        return parseFloat(digitMatch[1].replace(',', '.'));
    }
    // Try word
    return wordToNumber(trimmed);
}

function findWordNumberAndUnit(segment: string): { value: number; unit: string } | null {
    // Try each possible split point: the unit is a known time-unit word at the end
    const allUnits = [...TIME_UNITS_MINUTES, ...TIME_UNITS_SECONDS, ...TIME_UNITS_HOURS, ...TIME_UNITS_DAYS]
        .sort((a, b) => b.length - a.length);

    for (const unit of allUnits) {
        if (segment.endsWith(unit)) {
            const numberPart = segment.slice(0, segment.length - unit.length).trim();
            if (numberPart) {
                const val = wordToNumber(numberPart);
                if (val !== null) {
                    return { value: val, unit };
                }
            }
        }
    }
    return null;
}

export interface TimerMatch {
    /** The full matched text as it appeared in the source */
    fullMatch: string;
    /** Duration in milliseconds */
    ms: number;
    /** Start index in the original text */
    index: number;
}

/**
 * Find all timer matches in a text string.
 */
export function parseTimeMatches(text: string): TimerMatch[] {
    const regex = buildTimerRegex();
    const matches: TimerMatch[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
        const ms = parseTimeToMs(match[0]);
        if (ms > 0) {
            matches.push({
                fullMatch: match[0],
                ms,
                index: match.index,
            });
        }
    }

    return matches;
}
