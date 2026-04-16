import type { AstNode, LangiumDocument } from 'langium';
import {
  DefaultCompletionProvider,
  type LangiumServices,
} from 'langium/lsp';
import { CompletionItemKind, CompletionList } from 'vscode-languageserver';
import type { CompletionItem, CompletionParams } from 'vscode-languageserver';
import type { CancellationToken } from 'vscode-languageserver';
import type { OclServices } from './ocl-module.js';
import type { OclEmfBridge } from './ocl-emf-bridge.js';
import {
  isClassifierContext,
  isOperationContext,
  isPropertyContext,
  isCoclDerived,
  isCoclReferenceFilter,
} from '../generated/ast.js';
import { splitQualifiedPath } from '../utils.js';

const COLLECTION_OPERATIONS = [
  'select', 'reject', 'collect', 'forAll', 'exists', 'any', 'one',
  'isUnique', 'collectNested', 'closure', 'sortedBy', 'iterate',
  'includes', 'excludes', 'includesAll', 'excludesAll',
  'isEmpty', 'notEmpty', 'size', 'count', 'sum', 'min', 'max',
  'union', 'intersection', 'flatten', 'append', 'prepend', 'reverse',
  'first', 'last', 'at', 'indexOf',
  'asBag', 'asSet', 'asOrderedSet', 'asSequence',
];

const TYPE_OPERATIONS = [
  'oclIsTypeOf', 'oclIsKindOf', 'oclAsType', 'oclIsUndefined', 'oclIsInvalid',
];

const STRING_OPERATIONS = [
  'size', 'concat', 'substring', 'toInteger', 'toReal', 'toUpperCase', 'toLowerCase',
  'indexOf', 'equalsIgnoreCase', 'at', 'characters', 'toBoolean', 'matches',
];

/**
 * OCL completion provider extending Langium's DefaultCompletionProvider.
 *
 * Inherits grammar-based keyword and cross-reference completions,
 * and adds EMF-aware feature completions (attributes, references, operations)
 * for dot navigation (e.g. `self.`).
 */
export class OclCompletionProvider extends DefaultCompletionProvider {
  private emfBridge: OclEmfBridge;

  readonly completionOptions = {
    triggerCharacters: ['.', '>'],
  };

  constructor(services: OclServices) {
    super(services as unknown as LangiumServices);
    this.emfBridge = services.emfBridge;
  }

  override async getCompletion(
    document: LangiumDocument,
    params: CompletionParams,
    cancelToken?: CancellationToken,
  ): Promise<CompletionList | undefined> {
    // Run the default completion pipeline (keywords, cross-references)
    const defaultResult = await super.getCompletion(document, params, cancelToken);
    const items: CompletionItem[] = defaultResult?.items ?? [];

    // Analyze the text before the cursor to detect dot navigation
    const textDocument = document.textDocument;
    const offset = textDocument.offsetAt(params.position);
    const text = textDocument.getText();

    // Find the character just before cursor (skipping any partial identifier being typed)
    const beforeCursor = text.substring(0, offset);
    const dotMatch = beforeCursor.match(/\.\s*([a-zA-Z_]\w*)?$/);
    const arrowMatch = beforeCursor.match(/->\s*([a-zA-Z_]\w*)?$/);

    if (dotMatch || arrowMatch) {
      // We're after a dot or arrow - provide feature completions
      const contextTypeName = this.findContextTypeFromDocument(document);
      if (contextTypeName) {
        items.push(...this.buildFeatureItems(contextTypeName));
      }

      // Always add type, string, and collection operations after dot/arrow
      items.push(...this.buildOperationItems());
    } else {
      // General context: add class names
      items.push(...this.buildClassItems());
    }

    return CompletionList.create(items, true);
  }

  private findContextTypeFromDocument(document: LangiumDocument): string | undefined {
    const root = document.parseResult?.value;
    if (!root) return undefined;
    return this.findContextTypeInAst(root);
  }

  private findContextTypeInAst(node: AstNode): string | undefined {
    // Check the node itself
    if (isClassifierContext(node)) {
      return node.type;
    }
    if (isOperationContext(node)) {
      return splitQualifiedPath(node.path).type;
    }
    if (isPropertyContext(node)) {
      return splitQualifiedPath(node.path).type;
    }
    if (isCoclDerived(node)) {
      return splitQualifiedPath(node.path).type;
    }
    if (isCoclReferenceFilter(node)) {
      return splitQualifiedPath(node.path).type;
    }

    // Recurse into children
    for (const key of Object.keys(node)) {
      if (key.startsWith('$')) continue;
      const value = (node as any)[key];
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child === 'object' && '$type' in child) {
            const result = this.findContextTypeInAst(child);
            if (result) return result;
          }
        }
      } else if (value && typeof value === 'object' && '$type' in value) {
        const result = this.findContextTypeInAst(value);
        if (result) return result;
      }
    }
    return undefined;
  }

  private buildFeatureItems(contextTypeName: string): CompletionItem[] {
    const items: CompletionItem[] = [];
    const eClass = this.emfBridge.resolveClass(contextTypeName);
    if (!eClass) return items;

    for (const attr of this.emfBridge.getAttributesForClass(eClass)) {
      const name = attr.getName();
      if (name) {
        const type = attr.getEType();
        items.push({
          label: name,
          kind: CompletionItemKind.Field,
          detail: type ? `${name} : ${type.getName()}` : name,
          sortText: `0_${name}`,
        });
      }
    }

    for (const ref of this.emfBridge.getReferencesForClass(eClass)) {
      const name = ref.getName();
      if (name) {
        const type = ref.getEReferenceType();
        items.push({
          label: name,
          kind: CompletionItemKind.Reference,
          detail: type ? `${name} : ${type.getName()}` : name,
          sortText: `0_${name}`,
        });
      }
    }

    for (const op of this.emfBridge.getOperationsForClass(eClass)) {
      const name = op.getName();
      if (name) {
        items.push({
          label: name,
          kind: CompletionItemKind.Method,
          detail: 'Operation',
          sortText: `1_${name}`,
        });
      }
    }

    return items;
  }

  private buildOperationItems(): CompletionItem[] {
    const items: CompletionItem[] = [];

    for (const op of TYPE_OPERATIONS) {
      items.push({
        label: op,
        kind: CompletionItemKind.Method,
        detail: 'Type operation',
        sortText: `2_${op}`,
      });
    }
    for (const op of STRING_OPERATIONS) {
      items.push({
        label: op,
        kind: CompletionItemKind.Method,
        detail: 'String operation',
        sortText: `3_${op}`,
      });
    }
    for (const op of COLLECTION_OPERATIONS) {
      items.push({
        label: op,
        kind: CompletionItemKind.Method,
        detail: 'Collection operation',
        sortText: `4_${op}`,
      });
    }

    return items;
  }

  private buildClassItems(): CompletionItem[] {
    const items: CompletionItem[] = [];

    for (const cls of this.emfBridge.getAllClasses()) {
      const name = cls.getName();
      if (name) {
        items.push({
          label: name,
          kind: CompletionItemKind.Class,
          detail: 'EClass',
          sortText: `5_${name}`,
        });
      }
    }

    return items;
  }
}