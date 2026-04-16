import type { AstNode, MaybePromise } from 'langium';
import { AstNodeHoverProvider, type LangiumServices } from 'langium/lsp';
import type { Hover } from 'vscode-languageserver';
import type { OclServices } from './ocl-module.js';
import type { OclEmfBridge } from './ocl-emf-bridge.js';
import { splitQualifiedPath } from '../utils.js';
import {
  isClassifierContext,
  isOperationContext,
  isPropertyContext,
  isDotExpression,
  isArrowExpression,
  isSelfExpression,
  isVariableExpression,
  isCoclValidation,
  isCoclDerived,
  isCoclReferenceFilter,
} from '../generated/ast.js';

export class OclHoverProvider extends AstNodeHoverProvider {
  private emfBridge: OclEmfBridge;

  constructor(services: OclServices) {
    super(services as unknown as LangiumServices);
    this.emfBridge = services.emfBridge;
  }

  protected override getAstNodeHoverContent(node: AstNode): MaybePromise<Hover | undefined> {
    const content = this.getHoverText(node);
    if (content) {
      return {
        contents: {
          kind: 'markdown',
          value: content,
        },
      };
    }
    return undefined;
  }

  private getHoverText(node: AstNode): string | undefined {
    if (isClassifierContext(node)) {
      return this.hoverClassifierContext(node.type);
    }
    if (isOperationContext(node)) {
      const { type } = splitQualifiedPath(node.path);
      return this.hoverClassifierContext(type);
    }
    if (isPropertyContext(node)) {
      const { type, member } = splitQualifiedPath(node.path);
      return this.hoverPropertyContext(type, member ?? '');
    }
    if (isSelfExpression(node)) {
      return this.hoverSelf(node);
    }
    if (isDotExpression(node)) {
      return `**Feature**: \`${node.feature}\``;
    }
    if (isArrowExpression(node)) {
      return this.hoverArrowOperation(node.operation);
    }
    if (isVariableExpression(node)) {
      return `**Name**: \`${node.name}\``;
    }
    if (isCoclValidation(node)) {
      const { type, member } = splitQualifiedPath(node.path);
      return `**VALIDATION** constraint on \`${type}::${member}\``;
    }
    if (isCoclDerived(node)) {
      const { type, member } = splitQualifiedPath(node.path);
      return `**DERIVED** attribute \`${type}::${member}\``;
    }
    if (isCoclReferenceFilter(node)) {
      const { type, member } = splitQualifiedPath(node.path);
      return `**REFERENCE_FILTER** for \`${type}::${member}\``;
    }
    return undefined;
  }

  private hoverClassifierContext(typeName: string): string {
    const eClass = this.emfBridge.resolveClass(typeName);
    if (eClass) {
      const features = this.emfBridge.getFeaturesForClass(eClass);
      const featureNames = features.map(f => f.getName()).filter(Boolean);
      return `**Class**: \`${typeName}\`\n\n**Features**: ${featureNames.join(', ') || 'none'}`;
    }
    return `**Class**: \`${typeName}\``;
  }

  private hoverPropertyContext(typeName: string, property: string): string {
    const eClass = this.emfBridge.resolveClass(typeName);
    if (eClass) {
      const featureType = this.emfBridge.inferFeatureType(eClass, property);
      if (featureType) {
        return `**Property**: \`${typeName}::${property}\` : \`${featureType.getName()}\``;
      }
    }
    return `**Property**: \`${typeName}::${property}\``;
  }

  private hoverSelf(node: AstNode): string {
    let parent = node.$container;
    while (parent) {
      if (isClassifierContext(parent)) {
        return `**self** : \`${parent.type}\``;
      }
      if (isOperationContext(parent)) {
        const { type } = splitQualifiedPath(parent.path);
        return `**self** : \`${type}\``;
      }
      if (isPropertyContext(parent)) {
        const { type } = splitQualifiedPath(parent.path);
        return `**self** : \`${type}\``;
      }
      parent = parent.$container;
    }
    return '**self**';
  }

  private hoverArrowOperation(operation: string): string | undefined {
    const docs: Record<string, string> = {
      select: '`->select(x | expr)` - Selects elements where expr is true',
      reject: '`->reject(x | expr)` - Rejects elements where expr is true',
      collect: '`->collect(x | expr)` - Transforms each element',
      forAll: '`->forAll(x | expr)` - True if expr is true for all elements',
      exists: '`->exists(x | expr)` - True if expr is true for at least one element',
      any: '`->any(x | expr)` - Returns an element where expr is true',
      one: '`->one(x | expr)` - True if exactly one element satisfies expr',
      isUnique: '`->isUnique(x | expr)` - True if expr yields unique values',
      collectNested: '`->collectNested(x | expr)` - Like collect but preserves nesting',
      closure: '`->closure(x | expr)` - Transitive closure',
      sortedBy: '`->sortedBy(x | expr)` - Sorts elements by expr',
      iterate: '`->iterate(x; acc = init | expr)` - General iteration',
      includes: '`->includes(obj)` - True if collection contains obj',
      excludes: '`->excludes(obj)` - True if collection does not contain obj',
      includesAll: '`->includesAll(coll)` - True if all elements of coll are included',
      excludesAll: '`->excludesAll(coll)` - True if no elements of coll are included',
      isEmpty: '`->isEmpty()` - True if collection has no elements',
      notEmpty: '`->notEmpty()` - True if collection has at least one element',
      size: '`->size()` - Number of elements',
      count: '`->count(obj)` - Number of occurrences of obj',
      sum: '`->sum()` - Sum of numeric elements',
      min: '`->min()` - Minimum element',
      max: '`->max()` - Maximum element',
      union: '`->union(coll)` - Union of two collections',
      intersection: '`->intersection(coll)` - Intersection of two collections',
      flatten: '`->flatten()` - Flattens nested collections',
      append: '`->append(obj)` - Appends an element',
      prepend: '`->prepend(obj)` - Prepends an element',
      reverse: '`->reverse()` - Reverses element order',
      first: '`->first()` - First element',
      last: '`->last()` - Last element',
      at: '`->at(index)` - Element at position (1-based)',
      indexOf: '`->indexOf(obj)` - Index of element (1-based)',
      asBag: '`->asBag()` - Converts to Bag',
      asSet: '`->asSet()` - Converts to Set',
      asOrderedSet: '`->asOrderedSet()` - Converts to OrderedSet',
      asSequence: '`->asSequence()` - Converts to Sequence',
      oclIsTypeOf: '`->oclIsTypeOf(Type)` - True if exact type match',
      oclIsKindOf: '`->oclIsKindOf(Type)` - True if type or subtype',
      oclAsType: '`->oclAsType(Type)` - Casts to given type',
    };
    return docs[operation] ? `**Collection Operation**\n\n${docs[operation]}` : undefined;
  }
}