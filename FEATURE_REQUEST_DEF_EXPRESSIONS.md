# Feature Request: def: Expressions in Grammar und Evaluator

## Zusammenfassung

Die OCL-Spezifikation (§4.7) erlaubt `def:` Ausdrücke um Hilfsattribute und Hilfsoperationen zu definieren. Diese fehlen aktuell in der ocl-langium Grammar und im Evaluator.

## OCL Spec Referenz

```ocl
context Person
  def: fullName : String = self.firstName.concat(' ').concat(self.lastName)
  def: isAdult : Boolean = self.age >= 18
  def: getInitials() : String = self.firstName.substring(0, 1).concat(self.lastName.substring(0, 1))
```

`def:` definiert zusätzliche Properties/Operationen auf einer EClass, die in nachfolgenden OCL-Ausdrücken verwendbar sind. Sie verändern nicht das Metamodell, sondern erweitern den OCL-Namespace.

Fennec Java Engine unterstützt dies über `loadDocument()` (siehe [User Guide §10](https://github.com/eclipse-fennec/emf.m2x/blob/snapshot/docs/ocl-user-guide.md#10-complete-ocl-documents)).

## Vorgeschlagene Grammar-Erweiterung

```langium
// In ClassifierContext — neben InvariantConstraint auch DefExpression erlauben
ClassifierContext:
    'context' type=QualifiedName
    (constraints+=ClassifierConstraint)+;

ClassifierConstraint:
    InvariantConstraint | DefExpression;

// Neues Rule
DefExpression:
    'def' ':' name=ID
    // Attribut-Form: def: name : Type = expr
    (':' type=TypeExpression '=' expression=Expression)
    // Operations-Form: def: name(params) : Type = expr
    | ('(' (parameters+=Parameter (',' parameters+=Parameter)*)? ')' ':' returnType=TypeExpression '=' body=Expression);
```

## Evaluator-Änderung

Der `OclEvaluator` muss:
1. `def:` Expressions beim `evaluate(document, context)` erkennen
2. Die definierten Properties/Operationen in einer Map speichern
3. Bei `evalDotOp()` die Map konsultieren bevor auf `eGet` zurückgefallen wird

```typescript
// In OclEvaluator
private defProperties = new Map<string, { type: string; expression: Expression }>()
private defOperations = new Map<string, { params: Parameter[]; returnType: string; body: Expression }>()

// Bei DotExpression:
private evalDotOp(source, feature, args, env) {
  // Prüfe def: Properties
  const defProp = this.defProperties.get(feature)
  if (defProp) {
    return this.evalExpression(defProp.expression, { ...env, self: source })
  }
  // Prüfe def: Operations (mit args)
  const defOp = this.defOperations.get(feature)
  if (defOp) {
    const opEnv = { ...env, self: source }
    defOp.params.forEach((p, i) => opEnv.variables[p.name] = this.evalExpression(args[i], env))
    return this.evalExpression(defOp.body, opEnv)
  }
  // ... bestehende Logik ...
}
```

## Anwendungsfall in Gene

Gene lädt Complete OCL Dokumente (`.ocl` Dateien) die `def:` verwenden um berechnete Properties zu definieren, ohne das Ecore-Modell zu ändern. Aktuell kann Gene nur `inv:` auswerten.
