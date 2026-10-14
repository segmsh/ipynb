import { assert, describe, it } from "vitest";
import fs from "fs";
import path from "path";
import IpynbProcessor from "../src";
import { protectMath } from "../src/math.js";

const processor = new IpynbProcessor();

const fixtures = fs
  .readdirSync(path.join("test", "fixtures"))
  .filter((filename) => filename.endsWith(".ipynb"));

interface Cell {
  cell_type: string;
  source: string | string[];
}

function readFixture(filename: string): string {
  return fs.readFileSync(path.join("test", "fixtures", filename), {
    encoding: "utf-8",
  });
}

function cells(input: string): Cell[] {
  return JSON.parse(input).cells;
}

function source(cell: Cell): string {
  return Array.isArray(cell.source) ? cell.source.join("") : cell.source;
}

function formulas(value: string): string[] {
  const result: string[] = [];
  protectMath(value, result);
  return result.sort();
}

describe("IpynbProcessorTest", function () {
  fixtures.forEach((filename) => {
    it(`should process ${filename} correctly`, function () {
      const input = readFixture(filename);
      const document = processor.parse(input);
      const roundTripped = processor.parse(processor.stringify(document));

      assert.equal(JSON.stringify(roundTripped.segments), JSON.stringify(document.segments));
    });

    it(`should roundtrip ${filename} exactly`, function () {
      const input = readFixture(filename);

      assert.equal(processor.stringify(processor.parse(input)), input);
    });

    it(`should keep ${filename} formulas and other cells after translation`, function () {
      const input = readFixture(filename);
      const document = processor.parse(input);
      const expected = new Map<string, string>();

      document.segments.forEach((current) => {
        current.text = `Ü ${current.text}`;
        expected.set(current.id, current.text);
      });

      const output = processor.stringify(document);
      const before = cells(input);
      const after = cells(output);

      assert.equal(after.length, before.length);

      before.forEach((cell, index) => {
        if (cell.cell_type === "markdown") {
          assert.deepEqual(formulas(source(after[index])), formulas(source(cell)), `cell ${index}`);
        } else {
          assert.deepEqual(after[index], cell, `cell ${index}`);
        }
      });

      const translated = processor.parse(output).segments.map(({ text }) => text);

      assert.includeMembers(translated, [...expected.values()]);
    });
  });

  it("should keep formulas verbatim in segments", function () {
    const texts = processor.parse(readFixture("edge.ipynb")).segments.map(({ text }) => text);

    assert.includeMembers(texts, [
      "Einstein: $E = mc^2$, and {em0}more{/em0} text.",
      "Source stored as a {strong0}single string{/strong0} with $x_1$.",
    ]);
    assert.isTrue(texts.some((text) => text.includes("\\(a_1 + b_1\\)")));
  });

  it("should not treat prices or code as math", function () {
    const texts = processor.parse(readFixture("edge.ipynb")).segments.map(({ text }) => text);

    assert.isTrue(texts.some((text) => text.startsWith("Prices cost $5 and $10, not math.")));
    assert.isTrue(texts.some((text) => text.includes("echo $HOME")));
  });

  it("should skip code, raw and formula-only content", function () {
    const texts = processor.parse(readFixture("edge.ipynb")).segments.map(({ text }) => text);

    texts.forEach((text) => {
      assert.notInclude(text, "print(");
      assert.notInclude(text, "Raw cell text");
      assert.notInclude(text, "\\begin{aligned}");
      assert.notInclude(text, "\\begin{equation}");
      assert.notEqual(text, "$\\pi r^2$");
    });
  });

  it("should store the cell index in segment metadata", function () {
    const document = processor.parse(readFixture("edge.ipynb"));
    const cellsWithSegments = new Set(document.segments.map(({ metadata }) => metadata?.cell));

    assert.deepEqual([...cellsWithSegments], [0, 1, 2, 7]);
  });

  it("should only rewrite changed cells", function () {
    const input = readFixture("edge.ipynb");
    const document = processor.parse(input);
    const target = document.segments.find(({ text }) => text.startsWith("Einstein"))!;

    target.text = "Einstein: $E = mc^2$, und {em0}mehr{/em0} Text.";

    const before = cells(input);
    const after = cells(processor.stringify(document));

    assert.include(source(after[0]), "Einstein: $E = mc^2$, und *mehr* Text.");
    assert.include(source(after[0]), "\\dot{x} & = \\sigma(y-x) \\\\\n");
    after.slice(1).forEach((cell, index) => assert.deepEqual(cell, before[index + 1]));
  });

  it("should keep the source format of changed cells", function () {
    const document = processor.parse(readFixture("edge.ipynb"));

    document.segments.forEach((current) => {
      current.text = `Ü ${current.text}`;
    });

    const after = cells(processor.stringify(document));

    assert.isString(after[2].source);
    assert.isArray(after[0].source);
    assert.isFalse(source(after[0]).endsWith("\n"));
  });

  it("should produce deterministic ids", function () {
    const input = readFixture("single-systems.ipynb");

    assert.deepEqual(processor.parse(input), processor.parse(input));
  });
});
