import type { AstNode, Scope, ReferenceInfo, AstNodeDescription } from 'langium';
import { DefaultScopeProvider, EMPTY_SCOPE } from 'langium';
import type { OclServices } from './ocl-module.js';
import type { OclEmfBridge } from './ocl-emf-bridge.js';

export class OclScopeProvider extends DefaultScopeProvider {
  private emfBridge: OclEmfBridge;

  constructor(services: OclServices) {
    super(services);
    this.emfBridge = services.emfBridge;
  }

  override getScope(context: ReferenceInfo): Scope {
    // Default Langium scope handling - OCL uses string-based names rather than cross-references,
    // so most resolution happens in the evaluator/validator via the EMF bridge.
    return super.getScope(context);
  }

  protected getEmfBridge(): OclEmfBridge {
    return this.emfBridge;
  }

  protected getScopeForNode(_node: AstNode): AstNodeDescription[] {
    return [];
  }

  protected override getGlobalScope(_referenceType: string, _context: ReferenceInfo): Scope {
    return EMPTY_SCOPE;
  }
}
