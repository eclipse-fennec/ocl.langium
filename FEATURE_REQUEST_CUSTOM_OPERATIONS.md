# Feature Request: Custom Operation Provider

## Zusammenfassung

Die Fennec Java Engine erlaubt die Registrierung benutzerdefinierter OCL-Operationen über `OclOperationProvider` (siehe [User Guide §11](https://github.com/eclipse-fennec/emf.m2x/blob/snapshot/docs/ocl-user-guide.md#11-custom-operations)). ocl-langium hat kein Äquivalent.

## Anforderung

Ein Provider-Mechanismus der dem Evaluator zusätzliche Operationen bereitstellt:

```typescript
export interface OclOperation {
  /** Operationsname (z.B. "toUpperCase") */
  name: string
  /** Typ auf dem die Operation definiert ist (z.B. "String", "Person") */
  ownerType: string
  /** Parameter-Definitionen */
  parameters: { name: string; type: string }[]
  /** Implementierung */
  execute: (self: unknown, args: unknown[]) => unknown
}

export interface OclOperationProvider {
  getOperations(): OclOperation[]
}
```

## Evaluator-Integration

```typescript
export class OclEvaluator {
  private customOperations = new Map<string, OclOperation[]>() // ownerType → operations

  registerProvider(provider: OclOperationProvider): void {
    for (const op of provider.getOperations()) {
      const ops = this.customOperations.get(op.ownerType) || []
      ops.push(op)
      this.customOperations.set(op.ownerType, ops)
    }
  }

  // In evalDotOp():
  private evalDotOp(source, feature, args, env) {
    // ... bestehende Logik ...

    // Custom Operations prüfen
    const typeName = this.getTypeName(source)
    const customOps = this.customOperations.get(typeName) || []
    const customOp = customOps.find(op => op.name === feature)
    if (customOp) {
      const evalArgs = args.map(a => this.evalExpression(a, env))
      return customOp.execute(source, evalArgs)
    }

    // ... Fallback ...
  }
}
```

## Anwendungsfall in Gene

Gene-Plugins könnten domänenspezifische OCL-Operationen bereitstellen:

```typescript
// Beispiel: SQL-Plugin fügt toSQL() Operation hinzu
executor.registerProvider({
  getOperations: () => [{
    name: 'toSQL',
    ownerType: 'Query',
    parameters: [],
    execute: (self) => generateSQL(self)
  }]
})

// Dann in OCL:
// context Query inv: self.toSQL().size() > 0
```

## Sicherheit

Custom Operations sollten über ein opt-in Flag geschützt sein (wie `customOperationsEnabled` in der Java Engine), damit sie nicht versehentlich in Sandbox-Kontexten verfügbar sind.
