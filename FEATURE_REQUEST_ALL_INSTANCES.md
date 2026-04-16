# Feature Request: allInstances() im Evaluator

## Zusammenfassung

`Type.allInstances()` ist eine zentrale OCL-Operation die alle Instanzen einer EClass im Modell-Scope zurückgibt. Die Grammar erkennt die Syntax (`TypeExpLiteral` + `.allInstances()`), aber der Evaluator implementiert die Auflösung nicht.

## OCL Spec Referenz

```ocl
-- Alle Personen im Modell
Person.allInstances()

-- Alle Personen über 65
Person.allInstances()->select(p | p.age > 65)

-- Eindeutigkeitsprüfung
self.students->isUnique(s | s.studentId)
-- vs. global:
Student.allInstances()->isUnique(s | s.studentId)
```

## Fennec Java Engine Referenz

Die Java-Engine nutzt `OclModelExtent` (siehe [User Guide §5.3](https://github.com/eclipse-fennec/emf.m2x/blob/snapshot/docs/ocl-user-guide.md#53-oclmodelextent--allinstances-scope)):

```java
OclModelExtent extent = eClass -> myResource.getAllContents()
    .filter(eClass::isInstance).toList();
OclContext ctx = OclContext.of(myEObject, extent);
```

## Vorgeschlagene Änderung

### EvalOptions erweitern

```typescript
export interface EvalOptions {
  variables?: Record<string, unknown>
  throwOnError?: boolean
  /** Alle Objekte im Modell-Scope (für allInstances()) */
  extent?: unknown[]
}
```

### Evaluator: TypeExpLiteral + DotExpression

Aktuell wird `Type.allInstances()` als `TypeExpLiteral` → `DotExpression(feature='allInstances')` geparst. Der Evaluator muss:

1. `TypeExpLiteral` auflösen → EClass-Name als String
2. `evalDotOp()` bei `allInstances` → extent filtern nach Typ

```typescript
// In evalDotOp():
if (feature === 'allInstances' && typeof source === 'string') {
  // source ist der Typ-Name (z.B. "Person")
  const extent = env.extent || []
  return extent.filter(obj => {
    if (typeof obj === 'object' && obj !== null && 'eClass' in obj) {
      const eClass = (obj as any).eClass()
      return eClass?.getName() === source || /* supertype check */
    }
    return false
  })
}
```

## Anwendungsfall in Gene

Gene validiert OCL-Constraints wie `self.students->isUnique(s | s.studentId)` die implizit über Collections navigieren. Für globale Constraints wie `Student.allInstances()->forAll(...)` wird der Extent benötigt.

Gene würde den Extent aus der aktiven Resource sammeln und über `EvalOptions.extent` übergeben.
