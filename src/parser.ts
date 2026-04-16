import type { LangiumDocument } from 'langium';
import { URI } from 'langium';
import { createOclServices } from './language/ocl-module.js';
import type { OclDocument, Expression } from './generated/ast.js';
import { isClassifierContext } from './generated/ast.js';

export interface ParseResult {
  document: OclDocument;
  errors: ParseError[];
  hasErrors: boolean;
}

export interface ParseError {
  message: string;
  offset: number;
  length: number;
  line: number;
  column: number;
}

export interface ExpressionCacheStats {
  hits: number;
  misses: number;
  size: number;
}

let sharedServices: ReturnType<typeof createOclServices> | undefined;

function getServices(): ReturnType<typeof createOclServices> {
  if (!sharedServices) {
    sharedServices = createOclServices();
  }
  return sharedServices;
}

// --- Expression Cache ---

type CacheEntry = ParseResult | { expression: Expression | undefined; errors: ParseError[] };

let cacheEnabled = false;
let cacheMaxSize = 2048;
let cacheHits = 0;
let cacheMisses = 0;
const cache = new Map<string, CacheEntry>();

function lruGet<T extends CacheEntry>(key: string): T | undefined {
  if (!cacheEnabled) return undefined;
  const entry = cache.get(key);
  if (entry !== undefined) {
    // Move to end (most recently used) by re-inserting
    cache.delete(key);
    cache.set(key, entry);
    cacheHits++;
    return entry as T;
  }
  cacheMisses++;
  return undefined;
}

function lruSet(key: string, value: CacheEntry): void {
  if (!cacheEnabled) return;
  // If key already exists, delete first so re-insert moves it to end
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  // Evict oldest entries if over capacity
  while (cache.size > cacheMaxSize) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) {
      cache.delete(firstKey);
    }
  }
}

/**
 * Enable the expression cache with an optional maximum size (default 2048).
 */
export function enableExpressionCache(maxSize?: number): void {
  cacheEnabled = true;
  if (maxSize !== undefined && maxSize > 0) {
    cacheMaxSize = maxSize;
  }
  // Trim if new max is smaller than current size
  while (cache.size > cacheMaxSize) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) {
      cache.delete(firstKey);
    }
  }
}

/**
 * Disable the expression cache. Cached entries are preserved but not used.
 */
export function disableExpressionCache(): void {
  cacheEnabled = false;
}

/**
 * Clear all entries from the expression cache and reset hit/miss counters.
 */
export function clearExpressionCache(): void {
  cache.clear();
  cacheHits = 0;
  cacheMisses = 0;
}

/**
 * Return current cache statistics.
 */
export function getExpressionCacheStats(): ExpressionCacheStats {
  return {
    hits: cacheHits,
    misses: cacheMisses,
    size: cache.size,
  };
}

// --- Public API ---

export async function parseOcl(input: string): Promise<ParseResult> {
  const cacheKey = `doc:${input}`;
  const cached = lruGet<ParseResult>(cacheKey);
  if (cached) return cached;

  const services = getServices();
  const langiumDoc = await parseDocument(services, input);
  const parseResult = langiumDoc.parseResult;

  const errors: ParseError[] = parseResult.lexerErrors.map(e => ({
    message: e.message,
    offset: e.offset,
    length: e.length,
    line: e.line ?? 0,
    column: e.column ?? 0,
  }));

  for (const e of parseResult.parserErrors) {
    errors.push({
      message: e.message,
      offset: e.token.startOffset,
      length: (e.token.endOffset ?? e.token.startOffset) - e.token.startOffset + 1,
      line: e.token.startLine ?? 0,
      column: e.token.startColumn ?? 0,
    });
  }

  const result: ParseResult = {
    document: parseResult.value as OclDocument,
    errors,
    hasErrors: errors.length > 0,
  };

  lruSet(cacheKey, result);
  return result;
}

export async function parseOclExpression(input: string): Promise<{ expression: Expression | undefined; errors: ParseError[] }> {
  const cacheKey = `expr:${input}`;
  const cached = lruGet<{ expression: Expression | undefined; errors: ParseError[] }>(cacheKey);
  if (cached) return cached;

  const wrapped = `context __Dummy inv: ${input}`;
  const result = await parseOcl(wrapped);

  let expression: Expression | undefined;
  if (result.document.contexts.length > 0) {
    const ctx = result.document.contexts[0];
    if (isClassifierContext(ctx) && ctx.constraints.length > 0) {
      const first = ctx.constraints[0];
      if ('expression' in first) {
        expression = first.expression;
      }
    }
  }

  const exprResult = {
    expression,
    errors: result.errors,
  };

  lruSet(cacheKey, exprResult);
  return exprResult;
}

async function parseDocument(
  services: ReturnType<typeof createOclServices>,
  input: string,
): Promise<LangiumDocument> {
  const uri = URI.parse('memory:///input.ocl');
  const documentFactory = services.shared.workspace.LangiumDocumentFactory;
  const document = documentFactory.fromString(input, uri);

  const documentBuilder = services.shared.workspace.DocumentBuilder;
  await documentBuilder.build([document], { validation: false });

  return document;
}
