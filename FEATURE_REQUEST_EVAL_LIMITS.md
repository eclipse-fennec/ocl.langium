# Feature Request: Evaluation Limits (Timeout, Depth, Collection Size)

## Zusammenfassung

Der `OclEvaluator` hat aktuell keine Schutzmaßnahmen gegen Endlos-Auswertungen, Stack Overflows oder Memory-Explosion. Die Fennec Java Engine bietet konfigurierbare Limits (siehe [User Guide §6 und §14](https://github.com/eclipse-fennec/emf.m2x/blob/snapshot/docs/ocl-user-guide.md#6-evaluation-options)).

## Anforderung

Erweiterung von `EvalOptions` um Resource-Limits:

```typescript
export interface EvalOptions {
  variables?: Record<string, unknown>
  throwOnError?: boolean
  extent?: unknown[]

  /** Maximum Rekursionstiefe (Default: 1000) */
  maxDepth?: number
  /** Maximum Evaluierungszeit in ms (Default: 0 = kein Limit) */
  timeoutMs?: number
  /** Maximum Collection-Größe (Default: 1_000_000) */
  maxCollectionSize?: number
  /** Maximum closure() Iterationen (Default: 100_000) */
  maxClosureIterations?: number
  /** Maximum Regex-Länge für matches() (Default: 1000) */
  maxRegexLength?: number
  /** Null-Behandlung: 'strict' (→ OCL_INVALID) oder 'lenient' (→ null) */
  nullHandling?: 'strict' | 'lenient'
}
```

## Enforcement-Punkte

| Limit | Wo prüfen | Verhalten bei Überschreitung |
|-------|-----------|------------------------------|
| maxDepth | `evalExpression()` — Depth-Counter incrementieren | `OCL_INVALID` + Diagnostic |
| timeoutMs | `evalExpression()` — `Date.now()` gegen Deadline | `OCL_INVALID` + Diagnostic |
| maxCollectionSize | Collection-Literale, `allInstances()`, Arrow-Ops | `OCL_INVALID` + Diagnostic |
| maxClosureIterations | `closure()` Worklist-Loop | `OCL_INVALID` + Diagnostic |
| maxRegexLength | `matches()`, `replaceAll()` | `OCL_INVALID` + Diagnostic |

## Performance-Overhead

- Depth-Counter: vernachlässigbar (Integer-Increment)
- Timeout: ~15ns pro `Date.now()` Check (wie Java `System.nanoTime()`)
- Collection-Size: nur bei Collection-Erzeugung, nicht bei Iteration

## Referenz

Fennec Java Engine Defaults:

| Limit | Default |
|-------|---------|
| maxDepth | 1.000 |
| maxCollectionSize | 1.000.000 |
| maxClosureIterations | 100.000 |
| maxRegexLength | 1.000 |
| timeout | 0 (kein Limit) |

## Anwendungsfall in Gene

Gene evaluiert OCL aus User-Input (C-OCL Editor, Workspace-Konfiguration) und externen Quellen (Model Atlas). Ohne Limits kann ein fehlerhafter OCL-Ausdruck den Browser-Tab einfrieren.
