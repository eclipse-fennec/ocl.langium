/**
 * Copyright (c) 2024-2025 Data In Motion Consulting GmbH, Stadt Jena, Software Hochstein GmbH
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v2.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v20.html
 */

/**
 * OCL-Langium: Langium-based OCL parser with LSP support for EMFTS
 *
 * @example
 * ```typescript
 * import { parseOcl, OclEvaluator, createOclServices } from 'ocl-langium';
 *
 * // Parse an OCL document
 * const result = await parseOcl('context Person inv: self.age >= 0');
 *
 * // Evaluate against a context object
 * const evaluator = new OclEvaluator();
 * const evalResult = evaluator.evaluate(result.document, personObject);
 * console.log(evalResult.valid); // true or false
 * ```
 *
 * @packageDocumentation
 */

// Parser + Services
export { createOclServices, createOclLspServices } from './language/ocl-module.js';
export type { OclServices, OclSharedServices, OclAddedServices } from './language/ocl-module.js';
export { parseOcl, parseOclExpression, enableExpressionCache, disableExpressionCache, clearExpressionCache, getExpressionCacheStats } from './parser.js';
export type { ExpressionCacheStats } from './parser.js';

// Evaluator
export { OclEvaluator, OCL_INVALID } from './evaluator/index.js';
export type { EvalOptions, ConstraintEvalResult, OclEvaluationResult, OclOperation, OclOperationProvider } from './evaluator/index.js';

// EMF Bridge
export { OclEmfBridge } from './language/ocl-emf-bridge.js';

// Utilities
export { splitQualifiedPath } from './utils.js';

// LSP Services
export { OclValidator } from './language/ocl-validator.js';
export { OclScopeProvider } from './language/ocl-scope.js';
export { OclHoverProvider } from './language/ocl-hover.js';
export { OclCompletionProvider } from './language/ocl-completion.js';

// Generated AST types
export type {
  OclDocument,
  Expression,
  ClassifierContext,
  OperationContext,
  PropertyContext,
  InvariantConstraint,
  DefExpression,
  ClassifierConstraint,
  ContextDeclaration,
  ArrowExpression,
  BinaryExpression,
  BooleanLiteral,
  CollectionLiteral,
  DotExpression,
  IfExpression,
  IntegerLiteral,
  InvalidLiteral,
  LetExpression,
  NullLiteral,
  RealLiteral,
  SelfExpression,
  StringLiteral,
  TupleLiteral,
  TypeExpLiteral,
  UnaryExpression,
  VariableExpression,
  IteratorBody,
  Parameter,
  CollectionType,
  SimpleType,
  TupleType,
  TypeExpression,
  PreCondition,
  PostCondition,
  BodyCondition,
  DeriveConstraint,
  InitConstraint,
  CoclValidation,
  CoclDerived,
  CoclReferenceFilter,
} from './generated/ast.js';

// Generated type guards
export {
  isArrowExpression,
  isBinaryExpression,
  isBooleanLiteral,
  isClassifierContext,
  isClassifierConstraint,
  isInvariantConstraint,
  isDefExpression,
  isCollectionLiteral,
  isDotExpression,
  isIfExpression,
  isIntegerLiteral,
  isInvalidLiteral,
  isLetExpression,
  isNullLiteral,
  isOperationContext,
  isPropertyContext,
  isRealLiteral,
  isSelfExpression,
  isStringLiteral,
  isTupleLiteral,
  isTypeExpLiteral,
  isUnaryExpression,
  isVariableExpression,
  isIteratorBody,
  isCoclValidation,
  isCoclDerived,
  isCoclReferenceFilter,
} from './generated/ast.js';
