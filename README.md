# @segmsh/ipynb

Jupyter notebook processor for [segm.sh](https://segm.sh). This package parses `.ipynb` notebooks into a document (AST + segments) and stringifies them back, segmenting markdown cells with [@segmsh/md](https://github.com/segmsh/md) while leaving code, outputs and metadata intact.

## Installation

```bash
npm install @segmsh/ipynb
```

## Usage

```typescript
import IpynbProcessor from "@segmsh/ipynb";

const processor = new IpynbProcessor();

const document = processor.parse(notebookJson);
// Markdown cell "Energy is $E = mc^2$." becomes the segment
// { text: "Energy is $E = mc^2$.", metadata: { cell: 0 } }

// ... modify document segments ...

const newNotebookJson = processor.stringify(document);
```

## Features

- **Markdown Cells**: Segmented with the md processor; code and raw cells are never segmented.
- **LaTeX**: Formulas (`$…$`, `$$…$$`, `\(…\)`, `\[…\]`, `\begin{…}…\end{…}`) are kept verbatim in segments and protected from Markdown escaping. Formula-only blocks are not offered for translation.
- **Source Preservation**: Unchanged cells, outputs and notebook metadata are kept as is; the JSON keeps its key order and indentation, and only changed markdown cells are rewritten.
- **Cell Context**: Each segment carries its cell index in `metadata.cell`.
- **Round-trip**: Parsing and stringifying an unchanged notebook returns the original input.

## Development

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

## License

[Apache-2.0](LICENSE)
