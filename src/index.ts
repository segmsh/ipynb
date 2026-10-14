import {
  Document,
  Element,
  Processor,
  Root,
  Segment,
  SegmentRef,
  id,
  root,
  visit,
} from "@segmsh/core";
import MdProcessor from "@segmsh/md";
import { isMathOnly, protectMath, restoreMath } from "./math.js";

interface Cell {
  cell_type: string;
  source: string | string[];
  [key: string]: unknown;
}

interface Notebook {
  cells: Cell[];
  [key: string]: unknown;
}

const NOTEBOOK_KEY = "notebook";

const joinSource = (source: string | string[]): string =>
  Array.isArray(source) ? source.join("") : source;

// nbformat stores source as lines that keep their trailing newline
const splitSource = (source: string): string[] =>
  source ? source.split(/(?<=\n)/) : [];

const contentId = (current: Segment): string =>
  id({ text: current.text, ...(current.tags && { tags: current.tags }) });

const getSegmentRefs = (node: Element): string[] => {
  const refs: string[] = [];

  visit(node, "segment", (ref: SegmentRef) => {
    refs.push(ref.id);
  });

  return refs;
};

export default class IpynbProcessor implements Processor {
  private readonly md = new MdProcessor();

  parse(res: string): Document {
    const notebook = JSON.parse(res) as Notebook;
    const children: Root["children"] = [];
    const segments: Segment[] = [];

    notebook.cells.forEach((cell, index) => {
      // Code and raw cells are not translatable
      if (cell.cell_type !== "markdown") return;

      const formulas: string[] = [];
      const cellDocument = this.md.parse(protectMath(joinSource(cell.source), formulas));
      const ids = new Map<string, string>();
      const hidden: Segment[] = [];

      cellDocument.segments.forEach((current) => {
        const restored: Segment = {
          ...current,
          text: restoreMath(current.text, formulas),
          metadata: { ...current.metadata, cell: index },
        };

        restored.id = contentId(restored);
        ids.set(current.id, restored.id);

        // Formula-only segments (e.g. display math blocks) stay out of translation
        (isMathOnly(current.text) ? hidden : segments).push(restored);
      });

      visit(cellDocument.tree, "segment", (ref: SegmentRef) => {
        ref.id = ids.get(ref.id) ?? ref.id;
      });

      children.push({
        type: "element",
        tagName: "cell",
        properties: {
          index,
          ...(hidden.length && { hidden: JSON.stringify(hidden) }),
        },
        children: cellDocument.tree.children as Element["children"],
      });
    });

    return {
      tree: root(children),
      segments,
      metadata: { [NOTEBOOK_KEY]: res },
    };
  }

  stringify(document: Document): string {
    const source = String(document.metadata?.[NOTEBOOK_KEY] ?? "");
    const notebook = JSON.parse(source) as Notebook;
    const segmentsMap = new Map<string, Segment>(
      document.segments.map((current) => [current.id, current]),
    );

    document.tree.children.forEach((child) => {
      if (child.type !== "element" || child.tagName !== "cell") return;

      const cell = notebook.cells[Number(child.properties.index)];
      const hidden: Segment[] = child.properties.hidden
        ? JSON.parse(String(child.properties.hidden))
        : [];
      const cellSegments = new Map<string, Segment>([
        ...hidden.map((current): [string, Segment] => [current.id, current]),
        ...segmentsMap,
      ]);
      const refs = getSegmentRefs(child);

      if (!cell || refs.some((ref) => !cellSegments.has(ref))) return;

      // Unchanged cells keep their original source
      if (refs.every((ref) => contentId(cellSegments.get(ref)!) === ref)) return;

      const formulas: string[] = [];
      const protectedSegments = [...new Set(refs)].map((ref) => {
        const current = cellSegments.get(ref)!;

        return {
          ...current,
          text: protectMath(current.text, formulas, { skipCode: false }),
        };
      });

      const original = joinSource(cell.source);
      let output = restoreMath(
        this.md.stringify({
          tree: structuredClone(root(child.children)),
          segments: protectedSegments,
        }),
        formulas,
      );

      if (!original.endsWith("\n") && output.endsWith("\n")) {
        output = output.slice(0, -1);
      }

      cell.source = Array.isArray(cell.source) ? splitSource(output) : output;
    });

    const indent = /^\{\r?\n( +|\t)"/.exec(source)?.[1] ?? 1;
    const newline = source.endsWith("\n") ? "\n" : "";

    return JSON.stringify(notebook, null, indent) + newline;
  }
}
