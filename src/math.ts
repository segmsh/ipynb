// Markdown treats backslashes as escapes, so LaTeX is swapped for opaque placeholders around the md processor
const placeholder = (index: number): string => `SEGMSHMATH${index}Z`;

const PLACEHOLDER_REGEXP: RegExp = /SEGMSHMATH(\d+)Z/g;

const MATH_REGEXP: RegExp = new RegExp(
  [
    String.raw`\$\$[\s\S]+?\$\$`,
    String.raw`\\begin\{([A-Za-z]+\*?)\}[\s\S]*?\\end\{\1\}`,
    String.raw`\\\[[\s\S]+?\\\]`,
    String.raw`\\\([\s\S]+?\\\)`,
    // Inline math: no space after the opening $, none before the closing $, no digit after it
    String.raw`(?<!\\)\$(?![\s$])(?:\\[\s\S]|(?!\n\n)[^$\\])+?(?<![\s\\])\$(?!\d)`,
  ].join("|"),
  "g",
);

const CODE_REGEXP: RegExp =
  /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[ \t]*$|(?![\s\S]))|(`+)(?!`)[\s\S]*?(?<!`)\2(?!`)/gm;

const getCodeRanges = (source: string): [number, number][] =>
  [...source.matchAll(CODE_REGEXP)].map((match) => [
    match.index,
    match.index + match[0].length,
  ]);

// Replaces formulas with placeholders, appending them to the shared formulas list
export const protectMath = (
  source: string,
  formulas: string[],
  options: { skipCode: boolean } = { skipCode: true },
): string => {
  const codeRanges = options.skipCode ? getCodeRanges(source) : [];

  return source.replace(MATH_REGEXP, (match, ...args) => {
    const offset = args[args.length - 2] as number;
    const inCode = codeRanges.some(([start, end]) => offset >= start && offset < end);

    if (inCode) return match;

    formulas.push(match);

    return placeholder(formulas.length - 1);
  });
};

export const restoreMath = (value: string, formulas: string[]): string =>
  value.replace(
    PLACEHOLDER_REGEXP,
    (match, index: string) => formulas[Number(index)] ?? match,
  );

// True when the text holds nothing but formulas and markup markers
export const isMathOnly = (value: string): boolean =>
  !value
    .replace(PLACEHOLDER_REGEXP, "")
    .replace(/\{\/?[^{}\s]+\}/g, "")
    .trim();
