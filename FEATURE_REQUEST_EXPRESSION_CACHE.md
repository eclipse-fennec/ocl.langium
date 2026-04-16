# Feature Request: Expression Cache für parseOcl / parseOclExpression

## Zusammenfassung

`parseOcl()` und `parseOclExpression()` in `parser.ts` erstellen bei jedem Aufruf ein neues Langium-Dokument über `DocumentBuilder.build()`. Bei wiederholter Auswertung desselben OCL-Ausdrucks (z.B. derived attributes, Validierung über viele Objekte) ist das ein erheblicher Performance-Overhead.

## Anforderung

Ein LRU-basierter Expression Cache in der Parser-Schicht, analog zum `OclLruExpressionCache` in der Java Fennec OCL Engine (siehe [ocl-user-guide.md §7](https://github.com/eclipse-fennec/emf.m2x/blob/snapshot/docs/ocl-user-guide.md#7-caching)).

## Vorgeschlagene API

```typescript
// parser.ts — bestehende Funktionen erweitern

// Option 1: Automatischer Cache (empfohlen)
export async function parseOclExpression(
  input: string,
  options?: { cache?: boolean }  // default: true
): Promise<{ expression: Expression | undefined; errors: ParseError[] }>

// Option 2: Expliziter Cache
export function setExpressionCache(cache: ExpressionCache): void
export function clearExpressionCache(): void
export function getExpressionCacheStats(): { hits: number; misses: number; size: number }

// Cache Interface
export interface ExpressionCache {
  get(key: string): ParseResult | undefined
  set(key: string, value: ParseResult): void
  clear(): void
  readonly size: number
}

// Default-Implementierung
export function createLruExpressionCache(maxSize?: number): ExpressionCache
```

## Cache-Key

`expression-string` als Key reicht, da die Langium-Grammar kontextfrei parst. Für `parseOcl()` (vollständige Dokumente) optional `nsURI#contextType#expression` wie in der Java-Implementierung.

## Erwartete Performance-Verbesserung

Basierend auf den Java-Benchmarks:

| Szenario | Ohne Cache | Mit Cache | Speedup |
|----------|-----------|-----------|---------|
| Einfacher Ausdruck (wiederholt) | ~6ms | ~0.06ms | ~100x |
| Mittlerer Ausdruck (wiederholt) | ~35ms | ~0.35ms | ~100x |

## Kontext: Gene-Nutzung

Gene evaluiert OCL in folgenden Szenarien mit hoher Wiederholrate:

1. **Derived Attributes** — Gleicher Ausdruck für jedes Objekt einer EClass (z.B. `self.firstName.concat(' ').concat(self.lastName)` für 100+ Person-Instanzen)
2. **Validierung** — Gleiche Invariante gegen alle Objekte einer Resource
3. **Reference Filter** — Gleicher OCL-Filter bei jedem Referenz-Setzen
4. **Live Validation** — Bei jeder Modell-Änderung werden alle Constraints neu evaluiert

Ohne Cache wird bei jeder `query(obj, expr)` der Langium DocumentBuilder aufgerufen — das ist der Bottleneck.

## Thread-Safety

Der Cache muss thread-safe sein (auch wenn JS single-threaded ist, können async Aufrufe interleaven). Eine einfache `Map` mit Size-Limit reicht.

## Vorgeschlagene Implementierung

```typescript
// In parser.ts

const DEFAULT_CACHE_SIZE = 2048

let expressionCache: Map<string, { expression: Expression | undefined; errors: ParseError[] }> | null = null
let cacheHits = 0
let cacheMisses = 0

export function enableExpressionCache(maxSize = DEFAULT_CACHE_SIZE): void {
  expressionCache = new Map()
  // LRU-Eviction bei set() wenn size > maxSize
}

export async function parseOclExpression(input: string): Promise<{ expression: Expression | undefined; errors: ParseError[] }> {
  // Cache lookup
  if (expressionCache) {
    const cached = expressionCache.get(input)
    if (cached) {
      cacheHits++
      return cached
    }
    cacheMisses++
  }

  // Parse
  const wrapped = `context __Dummy inv: ${input}`
  const result = await parseOcl(wrapped)
  // ... extract expression ...

  const parseResult = { expression, errors: result.errors }

  // Cache store
  if (expressionCache) {
    if (expressionCache.size >= DEFAULT_CACHE_SIZE) {
      // LRU: ältesten Eintrag entfernen
      const firstKey = expressionCache.keys().next().value
      expressionCache.delete(firstKey)
    }
    expressionCache.set(input, parseResult)
  }

  return parseResult
}

export function getExpressionCacheStats() {
  return { hits: cacheHits, misses: cacheMisses, size: expressionCache?.size ?? 0 }
}
```

## Referenz

- Java-Implementierung: `org.eclipse.fennec.m2x.ocl.engine.OclLruExpressionCache`
- User Guide: [§7 Caching](https://github.com/eclipse-fennec/emf.m2x/blob/snapshot/docs/ocl-user-guide.md#7-caching)
