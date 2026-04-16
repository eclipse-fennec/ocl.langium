import {
  type Module,
  type LangiumCoreServices,
  type LangiumSharedCoreServices,
  type PartialLangiumCoreServices,
  type DefaultSharedCoreModuleContext,
  inject,
  createDefaultCoreModule,
  createDefaultSharedCoreModule,
  EmptyFileSystem,
} from 'langium';
import {
  createDefaultSharedModule,
  type DefaultSharedModuleContext,
  type LangiumSharedServices,
} from 'langium/lsp';
import { OclGeneratedModule, OclLangiumGeneratedSharedModule } from '../generated/module.js';
import { OclValidator, registerOclValidationChecks } from './ocl-validator.js';
import { OclScopeProvider } from './ocl-scope.js';
import { OclHoverProvider } from './ocl-hover.js';
import { OclCompletionProvider } from './ocl-completion.js';
import { OclEmfBridge } from './ocl-emf-bridge.js';

export type OclAddedServices = {
  validation: {
    OclValidator: OclValidator;
  };
  lsp: {
    HoverProvider: OclHoverProvider;
    CompletionProvider: OclCompletionProvider;
  };
  references: {
    ScopeProvider: OclScopeProvider;
  };
  emfBridge: OclEmfBridge;
};

export type OclServices = LangiumCoreServices & OclAddedServices;

export type OclSharedServices = LangiumSharedCoreServices;

export const OclModule: Module<OclServices, PartialLangiumCoreServices & OclAddedServices> = {
  validation: {
    OclValidator: (services) => new OclValidator(services),
  },
  lsp: {
    HoverProvider: (services) => new OclHoverProvider(services),
    CompletionProvider: (services) => new OclCompletionProvider(services),
  },
  references: {
    ScopeProvider: (services) => new OclScopeProvider(services),
  },
  emfBridge: () => new OclEmfBridge(),
};

/**
 * Create OCL services for headless (non-LSP) use, e.g. parsing and evaluation.
 */
export function createOclServices(context?: DefaultSharedCoreModuleContext): {
  shared: OclSharedServices;
  ocl: OclServices;
} {
  const shared = inject(
    createDefaultSharedCoreModule(context ?? EmptyFileSystem),
    OclLangiumGeneratedSharedModule,
  );
  const ocl = inject(
    createDefaultCoreModule({ shared }),
    OclGeneratedModule,
    OclModule,
  );
  shared.ServiceRegistry.register(ocl);
  registerOclValidationChecks(ocl);
  return { shared, ocl };
}

/**
 * Create OCL services with full LSP support, for use in a language server or Web Worker.
 */
export function createOclLspServices(context: DefaultSharedModuleContext): {
  shared: LangiumSharedServices;
  ocl: OclServices;
} {
  const shared = inject(
    createDefaultSharedModule(context),
    OclLangiumGeneratedSharedModule,
  );
  const ocl = inject(
    createDefaultCoreModule({ shared }),
    OclGeneratedModule,
    OclModule,
  );
  shared.ServiceRegistry.register(ocl);
  registerOclValidationChecks(ocl);
  return { shared, ocl };
}
