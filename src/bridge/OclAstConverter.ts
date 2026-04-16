/**
 * Converts Langium OCL AST nodes into EMF OCL model instances (from ocl-model).
 *
 * Langium Expression → EMF OclExpression mapping:
 *   IntegerLiteral      → IntegerLiteralExp
 *   RealLiteral         → RealLiteralExp
 *   StringLiteral       → StringLiteralExp
 *   BooleanLiteral      → BooleanLiteralExp
 *   NullLiteral         → NullLiteralExp
 *   InvalidLiteral      → InvalidLiteralExp
 *   SelfExpression      → VariableExp (referredVariable = "self")
 *   VariableExpression   → VariableExp
 *   IfExpression         → IfExp
 *   LetExpression        → LetExp
 *   DotExpression        → PropertyCallExp or OperationCallExp
 *   ArrowExpression      → IteratorExp, IterateExp, or OperationCallExp (collection ops)
 *   BinaryExpression     → OperationCallExp (infix operator)
 *   UnaryExpression      → OperationCallExp (prefix operator)
 *   CollectionLiteral    → CollectionLiteralExp
 *   TupleLiteral         → TupleLiteralExp
 *   TypeExpLiteral       → TypeExp
 */

import type { EClass, EStructuralFeature, EOperation, EClassifier } from '@emfts/core';
import type {
  Expression,
  OclDocument,
  ClassifierContext,
  OperationContext,
  PropertyContext,
  InvariantConstraint,
  ContextDeclaration,
  IteratorBody,
  TypeExpression,
  CoclValidation,
  CoclDerived,
  CoclReferenceFilter,
} from '../generated/ast.js';
import {
  isArrowExpression,
  isBinaryExpression,
  isBooleanLiteral,
  isCollectionLiteral,
  isDotExpression,
  isIfExpression,
  isIntegerLiteral,
  isInvalidLiteral,
  isLetExpression,
  isNullLiteral,
  isRealLiteral,
  isSelfExpression,
  isStringLiteral,
  isTupleLiteral,
  isTypeExpLiteral,
  isUnaryExpression,
  isVariableExpression,
  isIteratorBody,
  isClassifierContext,
  isOperationContext,
  isPropertyContext,
  isCoclValidation,
  isCoclDerived,
  isCoclReferenceFilter,
  isSimpleType,
  isCollectionType,
  isTupleType,
} from '../generated/ast.js';
import { splitQualifiedPath } from '../utils.js';
import type { OclEmfBridge } from '../language/ocl-emf-bridge.js';

import { OclFactory } from '@emfts/ocl.model';
import type {
  OclExpression,
  Constraint,
  Variable,
  OperationCallExp,
  PropertyCallExp,
  IteratorExp,
  IterateExp,
  IfExp,
  LetExp,
  VariableExp,
  IntegerLiteralExp,
  RealLiteralExp,
  StringLiteralExp,
  BooleanLiteralExp,
  NullLiteralExp,
  InvalidLiteralExp,
  CollectionLiteralExp,
  TupleLiteralExp,
  TypeExp,
  CollectionItem as EmfCollectionItem,
  CollectionRange as EmfCollectionRange,
  TupleLiteralPart,
  OclType,
} from '@emfts/ocl.model';
import {
  CollectionKind as EmfCollectionKind,
  ConstraintKind,
} from '@emfts/ocl.model';

const ITERATOR_OPERATIONS = new Set([
  'select', 'reject', 'collect', 'collectNested',
  'forAll', 'exists', 'any', 'one', 'isUnique',
  'sortedBy', 'closure',
]);

/**
 * Converts a Langium OCL AST into EMF OCL model instances.
 */
export class OclAstConverter {
  private factory = OclFactory.eINSTANCE;
  private bridge: OclEmfBridge;
  private selfVariable: Variable | undefined;

  constructor(bridge: OclEmfBridge) {
    this.bridge = bridge;
  }

  // ============================================================
  // Document-level conversion
  // ============================================================

  convertDocument(doc: OclDocument): Constraint[] {
    const constraints: Constraint[] = [];
    for (const ctx of doc.contexts) {
      constraints.push(...this.convertContext(ctx));
    }
    return constraints;
  }

  convertContext(ctx: ContextDeclaration): Constraint[] {
    if (isClassifierContext(ctx)) return this.convertClassifierContext(ctx);
    if (isOperationContext(ctx)) return this.convertOperationContext(ctx);
    if (isPropertyContext(ctx)) return this.convertPropertyContext(ctx);
    if (isCoclValidation(ctx)) return this.convertCoclValidation(ctx);
    if (isCoclDerived(ctx)) return this.convertCoclDerived(ctx);
    if (isCoclReferenceFilter(ctx)) return this.convertCoclReferenceFilter(ctx);
    return [];
  }

  private convertClassifierContext(ctx: ClassifierContext): Constraint[] {
    const eClass = this.bridge.resolveClass(ctx.type);
    return ctx.constraints
      .filter((c): c is InvariantConstraint => 'expression' in c && !('body' in c))
      .map(inv => this.convertInvariant(inv, eClass));
  }

  private convertInvariant(inv: InvariantConstraint, contextClass?: EClass): Constraint {
    const c = this.factory.createConstraint();
    c.name = inv.name;
    c.kind = ConstraintKind.inv;
    c.specification = this.convertExpression(inv.expression);
    if (contextClass) c.contextClassifier = contextClass;
    return c;
  }

  private convertOperationContext(ctx: OperationContext): Constraint[] {
    const { type, member } = splitQualifiedPath(ctx.path);
    const eClass = this.bridge.resolveClass(type);
    const eOp = member && eClass ? this.resolveOperation(eClass, member) : undefined;

    return ctx.conditions.map(cond => {
      const c = this.factory.createConstraint();
      c.specification = this.convertExpression(cond.expression);
      if (eClass) c.contextClassifier = eClass;
      if (eOp) c.contextOperation = eOp;
      c.name = cond.name;

      switch (cond.$type) {
        case 'PreCondition': c.kind = ConstraintKind.pre; break;
        case 'PostCondition': c.kind = ConstraintKind.post; break;
        case 'BodyCondition': c.kind = ConstraintKind.body; break;
      }
      return c;
    });
  }

  private convertPropertyContext(ctx: PropertyContext): Constraint[] {
    const { type, member } = splitQualifiedPath(ctx.path);
    const eClass = this.bridge.resolveClass(type);
    const sf = member && eClass ? this.resolveFeature(eClass, member) : undefined;

    return ctx.constraints.map(pc => {
      const c = this.factory.createConstraint();
      c.specification = this.convertExpression(pc.expression);
      if (eClass) c.contextClassifier = eClass;
      if (sf) c.contextProperty = sf;
      c.kind = pc.$type === 'DeriveConstraint' ? ConstraintKind.derive : ConstraintKind.init;
      return c;
    });
  }

  private convertCoclValidation(ctx: CoclValidation): Constraint[] {
    const { type, member } = splitQualifiedPath(ctx.path);
    const eClass = this.bridge.resolveClass(type);
    const c = this.factory.createConstraint();
    c.name = member;
    c.kind = ConstraintKind.inv;
    c.specification = this.convertExpression(ctx.expression);
    if (eClass) c.contextClassifier = eClass;
    return [c];
  }

  private convertCoclDerived(ctx: CoclDerived): Constraint[] {
    const { type, member } = splitQualifiedPath(ctx.path);
    const eClass = this.bridge.resolveClass(type);
    const sf = member && eClass ? this.resolveFeature(eClass, member) : undefined;
    const c = this.factory.createConstraint();
    c.name = member;
    c.kind = ConstraintKind.derive;
    c.specification = this.convertExpression(ctx.expression);
    if (eClass) c.contextClassifier = eClass;
    if (sf) c.contextProperty = sf;
    return [c];
  }

  private convertCoclReferenceFilter(ctx: CoclReferenceFilter): Constraint[] {
    const { type, member } = splitQualifiedPath(ctx.path);
    const eClass = this.bridge.resolveClass(type);
    const sf = member && eClass ? this.resolveFeature(eClass, member) : undefined;
    const c = this.factory.createConstraint();
    c.name = member;
    c.kind = ConstraintKind.def;
    c.specification = this.convertExpression(ctx.expression);
    if (eClass) c.contextClassifier = eClass;
    if (sf) c.contextProperty = sf;
    return [c];
  }

  // ============================================================
  // Expression conversion
  // ============================================================

  convertExpression(expr: Expression): OclExpression {
    if (isIntegerLiteral(expr)) return this.convertIntegerLiteral(expr);
    if (isRealLiteral(expr)) return this.convertRealLiteral(expr);
    if (isStringLiteral(expr)) return this.convertStringLiteral(expr);
    if (isBooleanLiteral(expr)) return this.convertBooleanLiteral(expr);
    if (isNullLiteral(expr)) return this.convertNullLiteral();
    if (isInvalidLiteral(expr)) return this.convertInvalidLiteral();
    if (isSelfExpression(expr)) return this.convertSelfExpression();
    if (isVariableExpression(expr)) return this.convertVariableExpression(expr);
    if (isIfExpression(expr)) return this.convertIfExpression(expr);
    if (isLetExpression(expr)) return this.convertLetExpression(expr);
    if (isDotExpression(expr)) return this.convertDotExpression(expr);
    if (isArrowExpression(expr)) return this.convertArrowExpression(expr);
    if (isBinaryExpression(expr)) return this.convertBinaryExpression(expr);
    if (isUnaryExpression(expr)) return this.convertUnaryExpression(expr);
    if (isCollectionLiteral(expr)) return this.convertCollectionLiteral(expr);
    if (isTupleLiteral(expr)) return this.convertTupleLiteral(expr);
    if (isTypeExpLiteral(expr)) return this.convertTypeExpLiteral(expr);

    throw new Error(`Unknown Langium expression type: ${(expr as { $type: string }).$type}`);
  }

  // ---- Literals ----

  private convertIntegerLiteral(expr: { value: number }): IntegerLiteralExp {
    const e = this.factory.createIntegerLiteralExp();
    e.integerSymbol = expr.value;
    return e;
  }

  private convertRealLiteral(expr: { value: number }): RealLiteralExp {
    const e = this.factory.createRealLiteralExp();
    e.realSymbol = expr.value;
    return e;
  }

  private convertStringLiteral(expr: { value: string }): StringLiteralExp {
    const e = this.factory.createStringLiteralExp();
    e.stringSymbol = expr.value;
    return e;
  }

  private convertBooleanLiteral(expr: { value: string }): BooleanLiteralExp {
    const e = this.factory.createBooleanLiteralExp();
    e.booleanSymbol = expr.value === 'true';
    return e;
  }

  private convertNullLiteral(): NullLiteralExp {
    return this.factory.createNullLiteralExp();
  }

  private convertInvalidLiteral(): InvalidLiteralExp {
    return this.factory.createInvalidLiteralExp();
  }

  // ---- Self & Variables ----

  private convertSelfExpression(): VariableExp {
    const e = this.factory.createVariableExp();
    if (!this.selfVariable) {
      this.selfVariable = this.factory.createVariable();
      this.selfVariable.name = 'self';
    }
    e.referredVariable = this.selfVariable;
    return e;
  }

  private convertVariableExpression(expr: { name: string }): VariableExp {
    const e = this.factory.createVariableExp();
    const v = this.factory.createVariable();
    v.name = expr.name;
    e.referredVariable = v;
    return e;
  }

  // ---- If / Let ----

  private convertIfExpression(expr: {
    condition: Expression;
    thenExpression: Expression;
    elseExpression: Expression;
  }): IfExp {
    const e = this.factory.createIfExp();
    e.ownedCondition = this.convertExpression(expr.condition);
    e.ownedThen = this.convertExpression(expr.thenExpression);
    e.ownedElse = this.convertExpression(expr.elseExpression);
    return e;
  }

  private convertLetExpression(expr: {
    name: string;
    type?: TypeExpression;
    value: Expression;
    body: Expression;
  }): LetExp {
    const e = this.factory.createLetExp();
    const v = this.factory.createVariable();
    v.name = expr.name;
    if (expr.type) v.type = this.convertTypeExpression(expr.type);
    v.ownedInit = this.convertExpression(expr.value);
    e.ownedVariable = v;
    e.ownedIn = this.convertExpression(expr.body);
    return e;
  }

  // ---- Dot expressions (property access / operation call) ----

  private convertDotExpression(expr: {
    source: Expression;
    feature: string;
    arguments: Expression[];
  }): OclExpression {
    const source = this.convertExpression(expr.source);

    if (expr.arguments.length > 0) {
      // Operation call: source.feature(args)
      const e = this.factory.createOperationCallExp();
      e.ownedSource = source;
      e.name = expr.feature;
      for (const arg of expr.arguments) {
        e.ownedArguments.push(this.convertExpression(arg));
      }
      return e;
    }

    // Property access: source.feature
    const e = this.factory.createPropertyCallExp();
    e.ownedSource = source;
    // Try to resolve the structural feature against the context type
    // The feature name is stored in the referredProperty
    // For now, we create a PropertyCallExp with a name hint
    (e as PropertyCallExp & { name?: string }).name = expr.feature;
    return e;
  }

  // ---- Arrow expressions (collection operations / iterators) ----

  private convertArrowExpression(expr: {
    source: Expression;
    operation: string;
    arguments: Array<Expression | IteratorBody>;
  }): OclExpression {
    const source = this.convertExpression(expr.source);
    const iterBody = expr.arguments.find(a => isIteratorBody(a)) as IteratorBody | undefined;

    // iterate() is a special case with accumulator
    if (expr.operation === 'iterate' && iterBody?.iteratorName2) {
      return this.convertIterateExpression(source, iterBody, expr.arguments);
    }

    // Iterator operations with body
    if (ITERATOR_OPERATIONS.has(expr.operation) && iterBody) {
      const e = this.factory.createIteratorExp();
      e.ownedSource = source;
      e.name = expr.operation;

      // Create iterator variable
      const iterVar = this.factory.createVariable();
      iterVar.name = iterBody.iteratorName;
      if (iterBody.iteratorType) {
        iterVar.type = this.convertTypeExpression(iterBody.iteratorType);
      }
      e.ownedIterators.push(iterVar);

      // Second iterator variable (e.g., for two-variable forAll)
      if (iterBody.iteratorName2) {
        const iterVar2 = this.factory.createVariable();
        iterVar2.name = iterBody.iteratorName2;
        if (iterBody.iteratorType2) {
          iterVar2.type = this.convertTypeExpression(iterBody.iteratorType2);
        }
        e.ownedIterators.push(iterVar2);
      }

      e.ownedBody = this.convertExpression(iterBody.body);
      return e;
    }

    // Non-iterator collection operations (size, includes, isEmpty, etc.)
    const e = this.factory.createOperationCallExp();
    e.ownedSource = source;
    e.name = expr.operation;
    for (const arg of expr.arguments) {
      if (!isIteratorBody(arg)) {
        e.ownedArguments.push(this.convertExpression(arg));
      }
    }
    return e;
  }

  private convertIterateExpression(
    source: OclExpression,
    iterBody: IteratorBody,
    args: Array<Expression | IteratorBody>,
  ): IterateExp {
    const e = this.factory.createIterateExp();
    e.ownedSource = source;

    // Iterator variable
    const iterVar = this.factory.createVariable();
    iterVar.name = iterBody.iteratorName;
    if (iterBody.iteratorType) {
      iterVar.type = this.convertTypeExpression(iterBody.iteratorType);
    }
    e.ownedIterators.push(iterVar);

    // Accumulator variable
    const accVar = this.factory.createVariable();
    accVar.name = iterBody.iteratorName2!;
    if (iterBody.iteratorType2) {
      accVar.type = this.convertTypeExpression(iterBody.iteratorType2);
    }
    // Init expression for accumulator (second arg after iterBody)
    for (const arg of args) {
      if (!isIteratorBody(arg) && arg !== args[0]) {
        accVar.ownedInit = this.convertExpression(arg);
        break;
      }
    }
    e.ownedResult = accVar;

    e.ownedBody = this.convertExpression(iterBody.body);
    return e;
  }

  // ---- Binary / Unary operations → OperationCallExp ----

  private convertBinaryExpression(expr: {
    left: Expression;
    op: string;
    right: Expression;
  }): OperationCallExp {
    const e = this.factory.createOperationCallExp();
    e.ownedSource = this.convertExpression(expr.left);
    e.name = expr.op;
    e.ownedArguments.push(this.convertExpression(expr.right));
    return e;
  }

  private convertUnaryExpression(expr: {
    op: string;
    operand: Expression;
  }): OperationCallExp {
    const e = this.factory.createOperationCallExp();
    e.ownedSource = this.convertExpression(expr.operand);
    e.name = expr.op === '-' ? 'unaryMinus' : expr.op;
    return e;
  }

  // ---- Collection Literal ----

  private convertCollectionLiteral(expr: {
    kind: string;
    items: Array<{ first: Expression; last?: Expression }>;
  }): CollectionLiteralExp {
    const e = this.factory.createCollectionLiteralExp();
    e.kind = this.mapCollectionKind(expr.kind);

    for (const item of expr.items) {
      if (item.last) {
        // Range: first..last
        const range = this.factory.createCollectionRange();
        range.ownedFirst = this.convertExpression(item.first);
        range.ownedLast = this.convertExpression(item.last);
        e.ownedParts.push(range);
      } else {
        // Single item
        const ci = this.factory.createCollectionItem();
        ci.ownedItem = this.convertExpression(item.first);
        e.ownedParts.push(ci);
      }
    }
    return e;
  }

  // ---- Tuple Literal ----

  private convertTupleLiteral(expr: {
    parts: Array<{ name: string; value: Expression }>;
  }): TupleLiteralExp {
    const e = this.factory.createTupleLiteralExp();
    for (const part of expr.parts) {
      const tp = this.factory.createTupleLiteralPart();
      tp.name = part.name;
      tp.ownedInit = this.convertExpression(part.value);
      e.ownedParts.push(tp);
    }
    return e;
  }

  // ---- TypeExp Literal (Type::feature) ----

  private convertTypeExpLiteral(expr: { type: string; feature: string }): TypeExp {
    const e = this.factory.createTypeExp();
    const cls = this.bridge.resolveClass(expr.type);
    if (cls) {
      const ct = this.factory.createClassifierType();
      ct.referredClassifier = cls;
      e.referredType = ct;
    }
    return e;
  }

  // ============================================================
  // Type conversion
  // ============================================================

  convertTypeExpression(typeExpr: TypeExpression): OclType {
    if (isSimpleType(typeExpr)) {
      const name = typeExpr.name;
      // Check for primitive types
      switch (name) {
        case 'Integer':
        case 'Real':
        case 'String':
        case 'Boolean': {
          const pt = this.factory.createPrimitiveType();
          pt.name = name;
          return pt;
        }
        case 'OclAny': {
          return this.factory.createAnyType();
        }
        case 'OclVoid': {
          return this.factory.createVoidType();
        }
        case 'OclInvalid': {
          return this.factory.createInvalidType();
        }
        default: {
          // Classifier type
          const ct = this.factory.createClassifierType();
          const cls = this.bridge.resolveClass(name);
          if (cls) ct.referredClassifier = cls;
          ct.name = name;
          return ct;
        }
      }
    }

    if (isCollectionType(typeExpr)) {
      const elementType = this.convertTypeExpression(typeExpr.elementType);
      switch (typeExpr.kind) {
        case 'Set': {
          const t = this.factory.createSetType();
          t.elementType = elementType;
          return t;
        }
        case 'OrderedSet': {
          const t = this.factory.createOrderedSetType();
          t.elementType = elementType;
          return t;
        }
        case 'Bag': {
          const t = this.factory.createBagType();
          t.elementType = elementType;
          return t;
        }
        case 'Sequence': {
          const t = this.factory.createSequenceType();
          t.elementType = elementType;
          return t;
        }
        default: {
          const t = this.factory.createCollectionType();
          t.elementType = elementType;
          return t;
        }
      }
    }

    if (isTupleType(typeExpr)) {
      const tt = this.factory.createTupleType();
      for (const part of typeExpr.parts) {
        const tp = this.factory.createTuplePart();
        tp.name = part.name;
        tp.type = this.convertTypeExpression(part.type);
        tt.ownedParts.push(tp);
      }
      return tt;
    }

    // Fallback
    return this.factory.createAnyType();
  }

  // ============================================================
  // Helpers
  // ============================================================

  private mapCollectionKind(kind: string): string {
    switch (kind) {
      case 'Set': return EmfCollectionKind.Set;
      case 'OrderedSet': return EmfCollectionKind.OrderedSet;
      case 'Bag': return EmfCollectionKind.Bag;
      case 'Sequence': return EmfCollectionKind.Sequence;
      case 'Collection': return EmfCollectionKind.Collection;
      default: return EmfCollectionKind.Collection;
    }
  }

  private resolveFeature(eClass: EClass, featureName: string): EStructuralFeature | undefined {
    const features = this.bridge.getFeaturesForClass(eClass);
    for (const f of features) {
      if (f.getName() === featureName) return f;
    }
    return undefined;
  }

  private resolveOperation(eClass: EClass, operationName: string): EOperation | undefined {
    const ops = this.bridge.getOperationsForClass(eClass);
    for (const op of ops) {
      if (op.getName() === operationName) return op;
    }
    return undefined;
  }
}
