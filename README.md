# @eclipse-fennec/ocl.langium

Langium-based OCL (Object Constraint Language) parser with LSP support for EMFTS.

## Features

- Full OCL grammar implementation using [Langium](https://langium.org/)
- Language Server Protocol (LSP) support
  - Code completion
  - Hover information
  - Validation
  - Scoping
- OCL expression evaluator
- EMF bridge for model integration via [@emfts/core](https://www.npmjs.com/package/@emfts/core) and [@emfts/ocl.model](https://www.npmjs.com/package/@emfts/ocl.model)
- Generated AST types and type guards

## Installation

```bash
npm install @eclipse-fennec/ocl.langium
```

## Usage

```typescript
import { createOclServices, parseOcl, OclEvaluator } from '@eclipse-fennec/ocl.langium';

// Create parser services
const services = createOclServices();

// Parse an OCL document
const result = await parseOcl('context Person inv: self.age >= 0');

// Evaluate against a context object
const evaluator = new OclEvaluator();
const evalResult = evaluator.evaluate(result.document, personObject);
console.log(evalResult.valid); // true or false
```

### LSP Integration

```typescript
import { createOclLspServices } from '@eclipse-fennec/ocl.langium';

const lspServices = createOclLspServices();
```

## Development

### Prerequisites

- Node.js 20 or 22
- npm

### Build

```bash
npm install
npm run build
```

### Watch Mode

```bash
npm run watch
```

### Generate Grammar

```bash
npm run langium:generate
```

### Test

```bash
npm run test
```

## Project Structure

```
src/
  grammar/          # OCL grammar definition (.langium)
  generated/        # Generated AST, grammar, and module
  language/         # LSP services (completion, hover, validation, scoping)
  evaluator/        # OCL expression evaluator
  bridge/           # EMF bridge (AST converter)
  index.ts          # Public API exports
```

## License

[EPL-2.0](https://www.eclipse.org/legal/epl-2.0/)
