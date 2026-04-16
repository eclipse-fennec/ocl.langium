import type {
  OclDocument,
  Expression,
  ClassifierContext,
  DefExpression,
  ContextDeclaration,
  IteratorBody,
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
  isInvariantConstraint,
  isDefExpression,
  isCoclValidation,
  isCoclDerived,
  isCoclReferenceFilter,
} from '../generated/ast.js';
import { splitQualifiedPath } from '../utils.js';

export const OCL_INVALID = Symbol('OCL_INVALID');

export interface EvalOptions {
  variables?: Record<string, unknown>;
  throwOnError?: boolean;
  extent?: unknown[];           // for allInstances (Feature 2)
  maxDepth?: number;            // default 1000
  timeoutMs?: number;           // default 0 (no limit)
  maxCollectionSize?: number;   // default 1_000_000
  maxClosureIterations?: number; // default 100_000
  maxRegexLength?: number;      // default 1000
  nullHandling?: 'strict' | 'lenient';
}

export interface ConstraintEvalResult {
  name: string | undefined;
  satisfied: boolean;
  expression: Expression;
  contextType: string;
  error?: string;
}

export interface OclEvaluationResult {
  valid: boolean;
  results: ConstraintEvalResult[];
}

export interface OclOperation {
  name: string;
  ownerType: string;
  parameters: { name: string; type: string }[];
  execute: (self: unknown, args: unknown[]) => unknown;
}

export interface OclOperationProvider {
  getOperations(): OclOperation[];
}

export class OclEvaluator {

  private customOperations = new Map<string, OclOperation[]>();

  registerProvider(provider: OclOperationProvider): void {
    for (const op of provider.getOperations()) {
      this.registerOperation(op);
    }
  }

  registerOperation(op: OclOperation): void {
    const key = `${op.ownerType}::${op.name}`;
    const existing = this.customOperations.get(key);
    if (existing) {
      existing.push(op);
    } else {
      this.customOperations.set(key, [op]);
    }
  }

  evaluate(document: OclDocument, context: unknown, options?: EvalOptions): OclEvaluationResult {
    const results: ConstraintEvalResult[] = [];

    for (const ctx of document.contexts) {
      const ctxResults = this.evaluateContext(ctx, context, options);
      results.push(...ctxResults);
    }

    return {
      valid: results.every(r => r.satisfied),
      results,
    };
  }

  evaluateContext(ctx: ContextDeclaration, context: unknown, options?: EvalOptions): ConstraintEvalResult[] {
    if (isClassifierContext(ctx)) {
      return this.evaluateClassifierContext(ctx, context, options);
    }
    if (isCoclValidation(ctx)) {
      const { type, member } = splitQualifiedPath(ctx.path);
      return this.evaluateSingleConstraint(member, ctx.expression, type, context, options);
    }
    if (isCoclDerived(ctx)) {
      const { type, member } = splitQualifiedPath(ctx.path);
      return this.evaluateSingleConstraint(member, ctx.expression, type, context, options);
    }
    if (isCoclReferenceFilter(ctx)) {
      const { type, member } = splitQualifiedPath(ctx.path);
      return this.evaluateSingleConstraint(member, ctx.expression, type, context, options);
    }
    return [];
  }

  private evaluateClassifierContext(ctx: ClassifierContext, context: unknown, options?: EvalOptions): ConstraintEvalResult[] {
    // Collect def: expressions (helper attributes and operations)
    const defAttributes = new Map<string, DefExpression>();
    const defOperations = new Map<string, DefExpression>();

    for (const constraint of ctx.constraints) {
      if (isDefExpression(constraint)) {
        if (constraint.parameters.length > 0 || constraint.returnType) {
          // Operation form: def: name(params) : Type = expr
          defOperations.set(constraint.name, constraint);
        } else {
          // Attribute form: def: name : Type = expr
          defAttributes.set(constraint.name, constraint);
        }
      }
    }

    // Evaluate invariants with def definitions available in env
    const results: ConstraintEvalResult[] = [];
    for (const constraint of ctx.constraints) {
      if (isInvariantConstraint(constraint)) {
        results.push(...this.evaluateSingleConstraint(
          constraint.name, constraint.expression, ctx.type, context, options,
          defAttributes, defOperations,
        ));
      }
    }
    return results;
  }

  private evaluateSingleConstraint(
    name: string | undefined,
    expression: Expression,
    contextType: string,
    context: unknown,
    options?: EvalOptions,
    defAttributes?: Map<string, DefExpression>,
    defOperations?: Map<string, DefExpression>,
  ): ConstraintEvalResult[] {
    try {
      const env = this.createEnv(context, options, defAttributes, defOperations);
      const result = this.evalExpression(expression, env);
      return [{
        name,
        satisfied: result === true,
        expression,
        contextType,
      }];
    } catch (e) {
      if (options?.throwOnError) throw e;
      return [{
        name,
        satisfied: false,
        expression,
        contextType,
        error: e instanceof Error ? e.message : String(e),
      }];
    }
  }

  evaluateExpression(expr: Expression, context: unknown, options?: EvalOptions): unknown {
    const env = this.createEnv(context, options);
    return this.evalExpression(expr, env);
  }

  private createEnv(
    context: unknown,
    options?: EvalOptions,
    defAttributes?: Map<string, DefExpression>,
    defOperations?: Map<string, DefExpression>,
  ): EvalEnv {
    const timeoutMs = options?.timeoutMs ?? 0;
    return {
      self: context,
      variables: { ...options?.variables },
      extent: options?.extent,
      depth: 0,
      maxDepth: options?.maxDepth ?? 1000,
      deadline: timeoutMs > 0 ? Date.now() + timeoutMs : 0,
      maxCollectionSize: options?.maxCollectionSize ?? 1_000_000,
      maxClosureIterations: options?.maxClosureIterations ?? 100_000,
      maxRegexLength: options?.maxRegexLength ?? 1000,
      defAttributes: defAttributes ?? new Map(),
      defOperations: defOperations ?? new Map(),
    };
  }

  // ============================================================
  // Expression Evaluation
  // ============================================================

  private evalExpression(expr: Expression, env: EvalEnv): unknown {
    // Check depth limit
    env.depth++;
    if (env.depth > env.maxDepth) {
      env.depth--;
      return OCL_INVALID;
    }

    // Check timeout
    if (env.deadline > 0 && Date.now() > env.deadline) {
      env.depth--;
      return OCL_INVALID;
    }

    try {
      return this.evalExpressionInner(expr, env);
    } finally {
      env.depth--;
    }
  }

  private evalExpressionInner(expr: Expression, env: EvalEnv): unknown {
    if (isLetExpression(expr)) {
      const value = this.evalExpression(expr.value, env);
      const newEnv: EvalEnv = {
        ...env,
        self: env.self,
        variables: { ...env.variables, [expr.name]: value },
      };
      return this.evalExpression(expr.body, newEnv);
    }

    if (isIfExpression(expr)) {
      const condition = this.evalExpression(expr.condition, env);
      return condition
        ? this.evalExpression(expr.thenExpression, env)
        : this.evalExpression(expr.elseExpression, env);
    }

    if (isBinaryExpression(expr)) {
      return this.evalBinary(expr.op, expr.left, expr.right, env);
    }

    if (isUnaryExpression(expr)) {
      return this.evalUnary(expr.op, expr.operand, env);
    }

    if (isArrowExpression(expr)) {
      const source = this.evalExpression(expr.source, env);
      return this.evalArrowOp(expr.operation, source, expr.arguments, env);
    }

    if (isDotExpression(expr)) {
      const source = this.evalExpression(expr.source, env);
      return this.evalDotOp(source, expr.feature, expr.arguments, env);
    }

    if (isSelfExpression(expr)) {
      return env.self;
    }

    if (isVariableExpression(expr)) {
      if (expr.name in env.variables) {
        return env.variables[expr.name];
      }
      // Could be an enum literal or class reference
      return expr.name;
    }

    if (isIntegerLiteral(expr)) {
      return expr.value;
    }

    if (isRealLiteral(expr)) {
      return expr.value;
    }

    if (isStringLiteral(expr)) {
      return expr.value;
    }

    if (isBooleanLiteral(expr)) {
      return expr.value === 'true';
    }

    if (isNullLiteral(expr)) {
      return null;
    }

    if (isInvalidLiteral(expr)) {
      return OCL_INVALID;
    }

    if (isCollectionLiteral(expr)) {
      const items: unknown[] = [];
      for (const item of expr.items) {
        const first = this.evalExpression(item.first, env);
        if (item.last) {
          const last = this.evalExpression(item.last, env);
          if (typeof first === 'number' && typeof last === 'number') {
            for (let i = first; i <= last; i++) {
              items.push(i);
              if (items.length > env.maxCollectionSize) return OCL_INVALID;
            }
          }
        } else {
          items.push(first);
        }
      }
      if (items.length > env.maxCollectionSize) return OCL_INVALID;
      if (expr.kind === 'Set' || expr.kind === 'OrderedSet') {
        return [...new Set(items)];
      }
      return items;
    }

    if (isTupleLiteral(expr)) {
      const tuple: Record<string, unknown> = {};
      for (const part of expr.parts) {
        tuple[part.name] = this.evalExpression(part.value, env);
      }
      return tuple;
    }

    if (isTypeExpLiteral(expr)) {
      return `${expr.type}::${expr.feature}`;
    }

    throw new Error(`Unknown expression type: ${(expr as { $type: string }).$type}`);
  }

  // ============================================================
  // Binary Operations
  // ============================================================

  private evalBinary(op: string, leftExpr: Expression, rightExpr: Expression, env: EvalEnv): unknown {
    // Short-circuit for logical operators
    if (op === 'implies') {
      const left = this.evalExpression(leftExpr, env);
      if (left === false) return true;
      return this.evalExpression(rightExpr, env) as boolean;
    }
    if (op === 'and') {
      const left = this.evalExpression(leftExpr, env);
      if (left === false) return false;
      return this.evalExpression(rightExpr, env) as boolean;
    }
    if (op === 'or') {
      const left = this.evalExpression(leftExpr, env);
      if (left === true) return true;
      return this.evalExpression(rightExpr, env) as boolean;
    }

    const left = this.evalExpression(leftExpr, env);
    const right = this.evalExpression(rightExpr, env);

    switch (op) {
      case 'xor':
        return (left as boolean) !== (right as boolean);
      case '=':
        return this.oclEquals(left, right);
      case '<>':
        return !this.oclEquals(left, right);
      case '<':
        return (left as number) < (right as number);
      case '>':
        return (left as number) > (right as number);
      case '<=':
        return (left as number) <= (right as number);
      case '>=':
        return (left as number) >= (right as number);
      case '+':
        if (typeof left === 'string' || typeof right === 'string') {
          return String(left) + String(right);
        }
        return (left as number) + (right as number);
      case '-':
        return (left as number) - (right as number);
      case '*':
        return (left as number) * (right as number);
      case '/':
        return (left as number) / (right as number);
      case 'div':
        return Math.trunc((left as number) / (right as number));
      case 'mod':
        return (left as number) % (right as number);
      default:
        throw new Error(`Unknown binary operator: ${op}`);
    }
  }

  // ============================================================
  // Unary Operations
  // ============================================================

  private evalUnary(op: string, operand: Expression, env: EvalEnv): unknown {
    const value = this.evalExpression(operand, env);
    switch (op) {
      case 'not':
        return !(value as boolean);
      case '-':
        return -(value as number);
      default:
        throw new Error(`Unknown unary operator: ${op}`);
    }
  }

  // ============================================================
  // Arrow (Collection) Operations
  // ============================================================

  private evalArrowOp(operation: string, source: unknown, args: Array<Expression | IteratorBody>, env: EvalEnv): unknown {
    const collection = this.toCollection(source);

    // Find iterator body if present
    const iterBody = args.find(a => isIteratorBody(a)) as IteratorBody | undefined;

    switch (operation) {
      // ---- Iterator Operations ----
      case 'select':
        return this.collectionFilter(collection, iterBody, args, env, true);
      case 'reject':
        return this.collectionFilter(collection, iterBody, args, env, false);
      case 'collect': {
        const result: unknown[] = [];
        for (const item of collection) {
          result.push(this.evalIteratorBody(iterBody, args, item, env));
          if (result.length > env.maxCollectionSize) return OCL_INVALID;
        }
        return result;
      }
      case 'collectNested': {
        const result: unknown[] = [];
        for (const item of collection) {
          result.push(this.evalIteratorBody(iterBody, args, item, env));
          if (result.length > env.maxCollectionSize) return OCL_INVALID;
        }
        return result;
      }
      case 'forAll': {
        for (const item of collection) {
          const result = this.evalIteratorBody(iterBody, args, item, env);
          if (result !== true) return false;
        }
        return true;
      }
      case 'exists': {
        for (const item of collection) {
          const result = this.evalIteratorBody(iterBody, args, item, env);
          if (result === true) return true;
        }
        return false;
      }
      case 'any': {
        for (const item of collection) {
          const result = this.evalIteratorBody(iterBody, args, item, env);
          if (result === true) return item;
        }
        return null;
      }
      case 'one': {
        let count = 0;
        for (const item of collection) {
          const result = this.evalIteratorBody(iterBody, args, item, env);
          if (result === true) count++;
        }
        return count === 1;
      }
      case 'isUnique': {
        const values = new Set<unknown>();
        for (const item of collection) {
          const result = this.evalIteratorBody(iterBody, args, item, env);
          if (values.has(result)) return false;
          values.add(result);
        }
        return true;
      }
      case 'closure': {
        const visited = new Set<unknown>();
        const result: unknown[] = [];
        const queue = [...collection];
        let iterations = 0;
        while (queue.length > 0) {
          iterations++;
          if (iterations > env.maxClosureIterations) return OCL_INVALID;
          const item = queue.shift()!;
          if (visited.has(item)) continue;
          visited.add(item);
          result.push(item);
          if (result.length > env.maxCollectionSize) return OCL_INVALID;
          const next = this.evalIteratorBody(iterBody, args, item, env);
          const nextColl = this.toCollection(next);
          queue.push(...nextColl);
        }
        return result;
      }
      case 'sortedBy': {
        const pairs: Array<{ item: unknown; key: unknown }> = [];
        for (const item of collection) {
          const key = this.evalIteratorBody(iterBody, args, item, env);
          pairs.push({ item, key });
        }
        pairs.sort((a, b) => {
          if (typeof a.key === 'number' && typeof b.key === 'number') return a.key - b.key;
          return String(a.key).localeCompare(String(b.key));
        });
        return pairs.map(p => p.item);
      }
      case 'iterate': {
        // iterate(elem; acc : Type = initExpr | bodyExpr)
        // This is a special case - the iterator body should have accumulator info
        // For now, simplified handling
        if (iterBody && iterBody.iteratorName2) {
          let acc = args.length > 1 ? this.evalExpression(args[1] as Expression, env) : undefined;
          for (const item of collection) {
            const iterEnv: EvalEnv = {
              ...env,
              self: env.self,
              variables: {
                ...env.variables,
                [iterBody.iteratorName]: item,
                [iterBody.iteratorName2]: acc,
              },
            };
            acc = this.evalExpression(iterBody.body, iterEnv);
          }
          return acc;
        }
        return null;
      }

      // ---- Non-Iterator Collection Operations ----
      case 'includes': {
        const arg = this.evalArgExpression(args, 0, env);
        return collection.some(item => this.oclEquals(item, arg));
      }
      case 'excludes': {
        const arg = this.evalArgExpression(args, 0, env);
        return !collection.some(item => this.oclEquals(item, arg));
      }
      case 'includesAll': {
        const other = this.toCollection(this.evalArgExpression(args, 0, env));
        return other.every(item => collection.some(c => this.oclEquals(c, item)));
      }
      case 'excludesAll': {
        const other = this.toCollection(this.evalArgExpression(args, 0, env));
        return other.every(item => !collection.some(c => this.oclEquals(c, item)));
      }
      case 'isEmpty':
        return collection.length === 0;
      case 'notEmpty':
        return collection.length > 0;
      case 'size':
        return collection.length;
      case 'count': {
        const arg = this.evalArgExpression(args, 0, env);
        return collection.filter(item => this.oclEquals(item, arg)).length;
      }
      case 'sum':
        return collection.reduce((acc: number, item) => acc + (item as number), 0);
      case 'min':
        return collection.length > 0 ? Math.min(...collection.map(x => x as number)) : OCL_INVALID;
      case 'max':
        return collection.length > 0 ? Math.max(...collection.map(x => x as number)) : OCL_INVALID;
      case 'union': {
        const other = this.toCollection(this.evalArgExpression(args, 0, env));
        const result = [...collection, ...other];
        if (result.length > env.maxCollectionSize) return OCL_INVALID;
        return result;
      }
      case 'intersection': {
        const other = this.toCollection(this.evalArgExpression(args, 0, env));
        return collection.filter(item => other.some(o => this.oclEquals(item, o)));
      }
      case 'symmetricDifference': {
        const other = this.toCollection(this.evalArgExpression(args, 0, env));
        const inA = collection.filter(item => !other.some(o => this.oclEquals(item, o)));
        const inB = other.filter(item => !collection.some(c => this.oclEquals(item, c)));
        const result = [...inA, ...inB];
        if (result.length > env.maxCollectionSize) return OCL_INVALID;
        return result;
      }
      case 'flatten':
        return this.flattenCollection(collection, env);
      case 'append': {
        const arg = this.evalArgExpression(args, 0, env);
        return [...collection, arg];
      }
      case 'prepend': {
        const arg = this.evalArgExpression(args, 0, env);
        return [arg, ...collection];
      }
      case 'insertAt': {
        const index = this.evalArgExpression(args, 0, env) as number;
        const element = this.evalArgExpression(args, 1, env);
        const result = [...collection];
        result.splice(index - 1, 0, element); // OCL is 1-based
        return result;
      }
      case 'subOrderedSet':
      case 'subSequence': {
        const lower = this.evalArgExpression(args, 0, env) as number;
        const upper = this.evalArgExpression(args, 1, env) as number;
        return collection.slice(lower - 1, upper); // OCL is 1-based
      }
      case 'reverse':
        return [...collection].reverse();
      case 'first':
        return collection.length > 0 ? collection[0] : OCL_INVALID;
      case 'last':
        return collection.length > 0 ? collection[collection.length - 1] : OCL_INVALID;
      case 'at': {
        const index = this.evalArgExpression(args, 0, env) as number;
        return index >= 1 && index <= collection.length ? collection[index - 1] : OCL_INVALID;
      }
      case 'indexOf': {
        const arg = this.evalArgExpression(args, 0, env);
        const idx = collection.findIndex(item => this.oclEquals(item, arg));
        return idx >= 0 ? idx + 1 : 0; // OCL is 1-based, 0 = not found
      }
      case 'asBag':
      case 'asSequence':
        return [...collection];
      case 'asSet':
      case 'asOrderedSet':
        return [...new Set(collection)];

      // ---- Type Operations (on collection source) ----
      case 'oclIsTypeOf':
      case 'oclIsKindOf':
      case 'oclAsType':
      case 'oclIsUndefined':
      case 'oclIsInvalid':
        return this.evalTypeOp(operation, source, args, env);

      default:
        throw new Error(`Unknown arrow operation: ->${operation}()`);
    }
  }

  // ============================================================
  // Dot Operations
  // ============================================================

  private evalDotOp(source: unknown, feature: string, args: Expression[], env: EvalEnv): unknown {
    // Type operations must be checked BEFORE null guard
    if (feature === 'oclIsUndefined') {
      return source === null || source === undefined;
    }
    if (feature === 'oclIsInvalid') {
      return source === OCL_INVALID;
    }

    // allInstances() support: source is a type name string
    if (feature === 'allInstances' && typeof source === 'string') {
      const extent = env.extent || [];
      return extent.filter(obj => {
        if (obj && typeof obj === 'object' && 'eClass' in obj) {
          const eClass = (obj as { eClass(): { getName?(): string | null } }).eClass();
          const className = eClass?.getName?.();
          // Check exact type match
          if (className === source) return true;
          // Check if source is a qualified name and the simple name matches
          if (source.includes('::')) {
            const parts = source.split('::');
            return className === parts[parts.length - 1];
          }
          return false;
        }
        return false;
      });
    }

    if (source === null || source === undefined || source === OCL_INVALID) {
      return OCL_INVALID;
    }
    if (feature === 'oclAsType') {
      return source; // simplified - no real type cast in JS
    }
    if (feature === 'oclIsTypeOf') {
      if (args.length > 0) {
        const typeName = this.evalExpression(args[0], env);
        return this.checkType(source, String(typeName), true);
      }
      return false;
    }
    if (feature === 'oclIsKindOf') {
      if (args.length > 0) {
        const typeName = this.evalExpression(args[0], env);
        return this.checkType(source, String(typeName), false);
      }
      return false;
    }

    // def: attribute — check before standard property access
    const defAttr = env.defAttributes.get(feature);
    if (defAttr) {
      const defEnv: EvalEnv = { ...env, self: source };
      return this.evalExpression(defAttr.body, defEnv);
    }

    // def: operation — check before standard method dispatch
    const defOp = env.defOperations.get(feature);
    if (defOp && defOp.parameters.length > 0) {
      const defEnv: EvalEnv = { ...env, self: source, variables: { ...env.variables } };
      for (let i = 0; i < defOp.parameters.length && i < args.length; i++) {
        defEnv.variables[defOp.parameters[i].name] = this.evalExpression(args[i], env);
      }
      return this.evalExpression(defOp.body, defEnv);
    }
    // def: operation without params (parameterless helper)
    if (defOp && defOp.parameters.length === 0) {
      const defEnv: EvalEnv = { ...env, self: source };
      return this.evalExpression(defOp.body, defEnv);
    }

    // String operations
    if (typeof source === 'string') {
      return this.evalStringOp(source, feature, args, env);
    }

    // Number operations
    if (typeof source === 'number') {
      return this.evalNumberOp(source, feature, args, env);
    }

    // Object property access / method calls
    if (typeof source === 'object' && source !== null) {
      // Try eGet for EObject-like objects
      if ('eGet' in source && typeof (source as Record<string, unknown>).eGet === 'function') {
        const eObj = source as { eGet(feature: string): unknown };
        const value = eObj.eGet(feature);
        if (value !== undefined) return value;
      }

      // Try get method
      if ('get' in source && typeof (source as Record<string, unknown>).get === 'function') {
        const obj = source as { get(key: string): unknown };
        const value = obj.get(feature);
        if (value !== undefined) return value;
      }

      // Direct property access
      const obj = source as Record<string, unknown>;
      const value = obj[feature];
      if (typeof value === 'function') {
        if (args.length > 0) {
          const evalArgs = args.map(a => this.evalExpression(a, env));
          return (value as (...a: unknown[]) => unknown).call(source, ...evalArgs);
        }
        return (value as () => unknown).call(source);
      }
      if (value !== undefined) return value;

      // Check custom operations for EObject sources
      const customResult = this.tryCustomOperation(source, feature, args, env);
      if (customResult !== undefined) return customResult;

      return value;
    }

    // Check custom operations for primitive sources
    const customResult = this.tryCustomOperation(source, feature, args, env);
    if (customResult !== undefined) return customResult;

    throw new Error(`Cannot navigate '${feature}' on ${typeof source}`);
  }

  // ============================================================
  // Custom Operation Lookup
  // ============================================================

  private tryCustomOperation(source: unknown, feature: string, args: Expression[], env: EvalEnv): unknown | undefined {
    // Determine owner type name
    let ownerType: string;
    if (source && typeof source === 'object' && 'eClass' in source) {
      const eClass = (source as { eClass(): { getName?(): string | null } }).eClass();
      ownerType = eClass?.getName?.() ?? typeof source;
    } else {
      ownerType = typeof source;
    }

    // Look up by exact type
    const key = `${ownerType}::${feature}`;
    let ops = this.customOperations.get(key);
    if (!ops) {
      // Also try wildcard owner type '*'
      ops = this.customOperations.get(`*::${feature}`);
    }
    if (ops && ops.length > 0) {
      const evalArgs = args.map(a => this.evalExpression(a, env));
      return ops[0].execute(source, evalArgs);
    }
    return undefined;
  }

  // ============================================================
  // String Operations
  // ============================================================

  private evalStringOp(source: string, op: string, args: Expression[], env: EvalEnv): unknown {
    switch (op) {
      case 'size':
        return source.length;
      case 'concat': {
        const arg = this.evalExpression(args[0], env);
        return source + String(arg);
      }
      case 'substring': {
        const lower = this.evalExpression(args[0], env) as number;
        const upper = this.evalExpression(args[1], env) as number;
        return source.substring(lower - 1, upper); // OCL is 1-based
      }
      case 'toInteger':
        return parseInt(source, 10);
      case 'toReal':
        return parseFloat(source);
      case 'toUpperCase':
        return source.toUpperCase();
      case 'toLowerCase':
        return source.toLowerCase();
      case 'indexOf': {
        const arg = this.evalExpression(args[0], env) as string;
        const idx = source.indexOf(arg);
        return idx >= 0 ? idx + 1 : 0; // OCL 1-based
      }
      case 'equalsIgnoreCase': {
        const arg = this.evalExpression(args[0], env) as string;
        return source.toLowerCase() === arg.toLowerCase();
      }
      case 'at': {
        const index = this.evalExpression(args[0], env) as number;
        return index >= 1 && index <= source.length ? source[index - 1] : OCL_INVALID;
      }
      case 'characters':
        return source.split('');
      case 'toBoolean':
        return source === 'true';
      case 'matches': {
        const pattern = this.evalExpression(args[0], env) as string;
        if (pattern.length > env.maxRegexLength) return OCL_INVALID;
        return new RegExp(pattern).test(source);
      }
      default: {
        // Check custom operations for string sources
        const customResult = this.tryCustomOperation(source, op, args, env);
        if (customResult !== undefined) return customResult;
        throw new Error(`Unknown string operation: .${op}()`);
      }
    }
  }

  // ============================================================
  // Number Operations
  // ============================================================

  private evalNumberOp(source: number, op: string, args: Expression[], env: EvalEnv): unknown {
    switch (op) {
      case 'abs':
        return Math.abs(source);
      case 'floor':
        return Math.floor(source);
      case 'round':
        return Math.round(source);
      case 'max': {
        const arg = this.evalExpression(args[0], env) as number;
        return Math.max(source, arg);
      }
      case 'min': {
        const arg = this.evalExpression(args[0], env) as number;
        return Math.min(source, arg);
      }
      case 'div': {
        const arg = this.evalExpression(args[0], env) as number;
        return Math.trunc(source / arg);
      }
      case 'mod': {
        const arg = this.evalExpression(args[0], env) as number;
        return source % arg;
      }
      case 'toString':
        return String(source);
      default: {
        // Check custom operations for number sources
        const customResult = this.tryCustomOperation(source, op, args, env);
        if (customResult !== undefined) return customResult;
        throw new Error(`Unknown number operation: .${op}()`);
      }
    }
  }

  // ============================================================
  // Type Operations
  // ============================================================

  private evalTypeOp(operation: string, source: unknown, args: Array<Expression | IteratorBody>, env: EvalEnv): unknown {
    switch (operation) {
      case 'oclIsUndefined':
        return source === null || source === undefined;
      case 'oclIsInvalid':
        return source === OCL_INVALID;
      case 'oclAsType':
        return source;
      case 'oclIsTypeOf': {
        if (args.length > 0 && !isIteratorBody(args[0])) {
          const typeName = this.evalExpression(args[0], env);
          return this.checkType(source, String(typeName), true);
        }
        return false;
      }
      case 'oclIsKindOf': {
        if (args.length > 0 && !isIteratorBody(args[0])) {
          const typeName = this.evalExpression(args[0], env);
          return this.checkType(source, String(typeName), false);
        }
        return false;
      }
      default:
        return OCL_INVALID;
    }
  }

  private checkType(source: unknown, typeName: string, exact: boolean): boolean {
    // EObject type checking
    if (source && typeof source === 'object' && 'eClass' in source) {
      const eObj = source as { eClass(): { getName(): string | null; isSuperTypeOf(other: unknown): boolean } };
      const eClass = eObj.eClass();
      const className = eClass.getName();
      if (exact) {
        return className === typeName;
      }
      // For oclIsKindOf, we'd need the target EClass to check inheritance
      return className === typeName;
    }
    // Primitive type checking
    switch (typeName) {
      case 'Integer': return typeof source === 'number' && Number.isInteger(source);
      case 'Real': return typeof source === 'number';
      case 'String': return typeof source === 'string';
      case 'Boolean': return typeof source === 'boolean';
      default: return false;
    }
  }

  // ============================================================
  // Helpers
  // ============================================================

  private evalIteratorBody(
    iterBody: IteratorBody | undefined,
    args: Array<Expression | IteratorBody>,
    item: unknown,
    env: EvalEnv,
  ): unknown {
    if (iterBody) {
      const iterEnv: EvalEnv = {
        ...env,
        self: env.self,
        variables: { ...env.variables, [iterBody.iteratorName]: item },
      };
      return this.evalExpression(iterBody.body, iterEnv);
    }
    // Fallback: evaluate first non-iterator arg with item as context
    for (const arg of args) {
      if (!isIteratorBody(arg)) {
        const argEnv: EvalEnv = {
          ...env,
          self: item,
          variables: env.variables,
        };
        return this.evalExpression(arg, argEnv);
      }
    }
    return item;
  }

  private evalArgExpression(args: Array<Expression | IteratorBody>, index: number, env: EvalEnv): unknown {
    let count = 0;
    for (const arg of args) {
      if (!isIteratorBody(arg)) {
        if (count === index) {
          return this.evalExpression(arg, env);
        }
        count++;
      }
    }
    return undefined;
  }

  private collectionFilter(
    collection: unknown[],
    iterBody: IteratorBody | undefined,
    args: Array<Expression | IteratorBody>,
    env: EvalEnv,
    keep: boolean,
  ): unknown[] {
    return collection.filter(item => {
      const result = this.evalIteratorBody(iterBody, args, item, env);
      return keep ? result === true : result !== true;
    });
  }

  private toCollection(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    if (value === null || value === undefined) return [];
    // EList-like objects
    if (value && typeof value === 'object' && 'size' in value && 'get' in value) {
      const list = value as { size(): number; get(i: number): unknown };
      const result: unknown[] = [];
      for (let i = 0; i < list.size(); i++) {
        result.push(list.get(i));
      }
      return result;
    }
    // Iterable
    if (value && typeof value === 'object' && Symbol.iterator in value) {
      return [...(value as Iterable<unknown>)];
    }
    return [value];
  }

  private flattenCollection(collection: unknown[], env: EvalEnv): unknown[] {
    const result: unknown[] = [];
    for (const item of collection) {
      if (Array.isArray(item)) {
        result.push(...this.flattenCollection(item, env));
      } else {
        result.push(item);
      }
      if (result.length > env.maxCollectionSize) return [OCL_INVALID];
    }
    return result;
  }

  private oclEquals(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    if (a === OCL_INVALID || b === OCL_INVALID) return a === b;
    if (typeof a === 'number' && typeof b === 'number') return a === b;
    if (typeof a === 'string' && typeof b === 'string') return a === b;
    if (typeof a === 'boolean' && typeof b === 'boolean') return a === b;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((item, index) => this.oclEquals(item, b[index]));
    }
    return a === b;
  }
}

interface EvalEnv {
  self: unknown;
  variables: Record<string, unknown>;
  extent?: unknown[];
  depth: number;
  maxDepth: number;
  deadline: number;
  maxCollectionSize: number;
  maxClosureIterations: number;
  maxRegexLength: number;
  defAttributes: Map<string, DefExpression>;
  defOperations: Map<string, DefExpression>;
}
