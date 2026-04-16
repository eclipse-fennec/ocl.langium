import type { AstNode, ValidationAcceptor, ValidationChecks } from 'langium';
import type {
  ClassifierContext,
  InvariantConstraint,
  OclDocument,
  OperationContext,
  PropertyContext,
  CoclValidation,
  CoclDerived,
  CoclReferenceFilter,
} from '../generated/ast.js';
import type { OclServices } from './ocl-module.js';
import type { OclEmfBridge } from './ocl-emf-bridge.js';
import type { OclLangiumAstType } from '../generated/ast.js';
import { splitQualifiedPath } from '../utils.js';

export function registerOclValidationChecks(services: OclServices): void {
  const registry = services.validation.ValidationRegistry;
  const validator = services.validation.OclValidator;
  const checks: ValidationChecks<OclLangiumAstType> = {
    OclDocument: validator.checkDocument,
    ClassifierContext: validator.checkClassifierContext,
    InvariantConstraint: validator.checkInvariantConstraint,
    OperationContext: validator.checkOperationContext,
    PropertyContext: validator.checkPropertyContext,
    CoclValidation: validator.checkCoclContext,
    CoclDerived: validator.checkCoclContext,
    CoclReferenceFilter: validator.checkCoclContext,
  };
  registry.register(checks, validator);
}

export class OclValidator {
  private emfBridge: OclEmfBridge;

  constructor(services: OclServices) {
    this.emfBridge = services.emfBridge;
  }

  checkDocument(document: OclDocument, accept: ValidationAcceptor): void {
    if (document.contexts.length === 0) {
      accept('hint', 'OCL document is empty.', { node: document });
    }
  }

  checkClassifierContext(ctx: ClassifierContext, accept: ValidationAcceptor): void {
    if (!ctx.type) {
      accept('error', 'Context type is missing.', { node: ctx, property: 'type' });
      return;
    }
    this.checkClassExists(ctx.type, ctx, accept);
  }

  checkInvariantConstraint(inv: InvariantConstraint, accept: ValidationAcceptor): void {
    if (!inv.expression) {
      accept('error', 'Invariant must have an expression.', { node: inv });
    }
  }

  checkOperationContext(ctx: OperationContext, accept: ValidationAcceptor): void {
    if (!ctx.path) {
      accept('error', 'Operation context path is missing.', { node: ctx });
      return;
    }
    const { type } = splitQualifiedPath(ctx.path);
    this.checkClassExists(type, ctx, accept);
  }

  checkPropertyContext(ctx: PropertyContext, accept: ValidationAcceptor): void {
    if (!ctx.path) {
      accept('error', 'Property context path is missing.', { node: ctx });
      return;
    }
    const { type } = splitQualifiedPath(ctx.path);
    this.checkClassExists(type, ctx, accept);
  }

  checkCoclContext(node: CoclValidation | CoclDerived | CoclReferenceFilter, accept: ValidationAcceptor): void {
    const { type } = splitQualifiedPath(node.path);
    this.checkClassExists(type, node, accept);
  }

  private checkClassExists(typeName: string, node: AstNode, accept: ValidationAcceptor): void {
    if (this.emfBridge.getRegisteredPackages().length === 0) {
      return;
    }
    const eClass = this.emfBridge.resolveClass(typeName);
    if (!eClass) {
      accept('warning', `Class '${typeName}' not found in registered packages.`, { node });
    }
  }
}
