import { describe, it, expect } from 'vitest';
import { parseOcl, parseOclExpression } from '../src/parser.js';
import {
  isClassifierContext,
  isOperationContext,
  isPropertyContext,
  isBinaryExpression,
  isDotExpression,
  isArrowExpression,
  isSelfExpression,
  isIntegerLiteral,
  isStringLiteral,
  isBooleanLiteral,
  isLetExpression,
  isIfExpression,
  isUnaryExpression,
  isVariableExpression,
  isCollectionLiteral,
  isTupleLiteral,
  isNullLiteral,
  isInvalidLiteral,
  isRealLiteral,
  isCoclValidation,
  isCoclDerived,
  isCoclReferenceFilter,
} from '../src/generated/ast.js';

describe('OCL Grammar - Context Declarations', () => {
  it('should parse a simple invariant', async () => {
    const result = await parseOcl('context Person inv: self.age >= 0');
    expect(result.hasErrors).toBe(false);
    expect(result.document.contexts).toHaveLength(1);
    const ctx = result.document.contexts[0];
    expect(isClassifierContext(ctx)).toBe(true);
    if (isClassifierContext(ctx)) {
      expect(ctx.type).toBe('Person');
      expect(ctx.constraints).toHaveLength(1);
    }
  });

  it('should parse a named invariant', async () => {
    const result = await parseOcl('context Person inv agePositive: self.age >= 0');
    expect(result.hasErrors).toBe(false);
    if (isClassifierContext(result.document.contexts[0])) {
      expect(result.document.contexts[0].constraints[0].name).toBe('agePositive');
    }
  });

  it('should parse multiple invariants', async () => {
    const result = await parseOcl(`
      context Person
        inv nameNotEmpty: self.name.size() > 0
        inv agePositive: self.age >= 0
    `);
    expect(result.hasErrors).toBe(false);
    if (isClassifierContext(result.document.contexts[0])) {
      expect(result.document.contexts[0].constraints).toHaveLength(2);
    }
  });

  it('should parse operation context with pre/post', async () => {
    const result = await parseOcl(`
      context Person::setAge(newAge: Integer): Boolean
        pre: newAge >= 0
        post: self.age = newAge
    `);
    expect(result.hasErrors).toBe(false);
    const ctx = result.document.contexts[0];
    expect(isOperationContext(ctx)).toBe(true);
    if (isOperationContext(ctx)) {
      expect(ctx.path).toBe('Person::setAge');
      expect(ctx.parameters).toHaveLength(1);
      expect(ctx.parameters[0].name).toBe('newAge');
      expect(ctx.conditions).toHaveLength(2);
    }
  });

  it('should parse property context with derive', async () => {
    const result = await parseOcl(`
      context Person::fullName: String
        derive: self.firstName.concat(' ').concat(self.lastName)
    `);
    expect(result.hasErrors).toBe(false);
    const ctx = result.document.contexts[0];
    expect(isPropertyContext(ctx)).toBe(true);
    if (isPropertyContext(ctx)) {
      expect(ctx.path).toBe('Person::fullName');
    }
  });

  it('should parse property context with init', async () => {
    const result = await parseOcl(`
      context Person::age: Integer
        init: 0
    `);
    expect(result.hasErrors).toBe(false);
    const ctx = result.document.contexts[0];
    expect(isPropertyContext(ctx)).toBe(true);
  });

  it('should parse multiple context declarations', async () => {
    const result = await parseOcl(`
      context Person inv: self.age >= 0
      context Company inv: self.employees->notEmpty()
    `);
    expect(result.hasErrors).toBe(false);
    expect(result.document.contexts).toHaveLength(2);
  });
});

describe('OCL Grammar - C-OCL Declarations', () => {
  it('should parse VALIDATION', async () => {
    const result = await parseOcl(`
      VALIDATION Company::checkEmployees
      self.employees->size() > 0
    `);
    expect(result.hasErrors).toBe(false);
    const ctx = result.document.contexts[0];
    expect(isCoclValidation(ctx)).toBe(true);
    if (isCoclValidation(ctx)) {
      expect(ctx.path).toBe('Company::checkEmployees');
    }
  });

  it('should parse DERIVED', async () => {
    const result = await parseOcl(`
      DERIVED Person::fullName
      self.firstName.concat(' ').concat(self.lastName)
    `);
    expect(result.hasErrors).toBe(false);
    const ctx = result.document.contexts[0];
    expect(isCoclDerived(ctx)).toBe(true);
    if (isCoclDerived(ctx)) {
      expect(ctx.path).toBe('Person::fullName');
    }
  });

  it('should parse REFERENCE_FILTER', async () => {
    const result = await parseOcl(`
      REFERENCE_FILTER Department::manager
      self.company.employees->select(e | e.role = 'Manager')
    `);
    expect(result.hasErrors).toBe(false);
    const ctx = result.document.contexts[0];
    expect(isCoclReferenceFilter(ctx)).toBe(true);
    if (isCoclReferenceFilter(ctx)) {
      expect(ctx.path).toBe('Department::manager');
    }
  });
});

describe('OCL Grammar - Expressions', () => {
  it('should parse self expression', async () => {
    const { expression, errors } = await parseOclExpression('self');
    expect(errors).toHaveLength(0);
    expect(isSelfExpression(expression)).toBe(true);
  });

  it('should parse integer literal', async () => {
    const { expression } = await parseOclExpression('42');
    expect(isIntegerLiteral(expression)).toBe(true);
    if (isIntegerLiteral(expression)) {
      expect(expression.value).toBe(42);
    }
  });

  it('should parse real literal', async () => {
    const { expression } = await parseOclExpression('3.14');
    expect(isRealLiteral(expression)).toBe(true);
    if (isRealLiteral(expression)) {
      expect(expression.value).toBe(3.14);
    }
  });

  it('should parse string literal', async () => {
    const { expression } = await parseOclExpression("'hello'");
    expect(isStringLiteral(expression)).toBe(true);
    if (isStringLiteral(expression)) {
      // Langium's value converter strips quotes
      expect(expression.value).toBe('hello');
    }
  });

  it('should parse boolean literals', async () => {
    const { expression: trueExpr } = await parseOclExpression('true');
    expect(isBooleanLiteral(trueExpr)).toBe(true);
    if (isBooleanLiteral(trueExpr)) {
      expect(trueExpr.value).toBe('true');
    }

    const { expression: falseExpr } = await parseOclExpression('false');
    expect(isBooleanLiteral(falseExpr)).toBe(true);
    if (isBooleanLiteral(falseExpr)) {
      expect(falseExpr.value).toBe('false');
    }
  });

  it('should parse null literal', async () => {
    const { expression } = await parseOclExpression('null');
    expect(isNullLiteral(expression)).toBe(true);
  });

  it('should parse invalid literal', async () => {
    const { expression } = await parseOclExpression('invalid');
    expect(isInvalidLiteral(expression)).toBe(true);
  });

  it('should parse binary comparison', async () => {
    const { expression } = await parseOclExpression('self.age >= 18');
    expect(isBinaryExpression(expression)).toBe(true);
    if (isBinaryExpression(expression)) {
      expect(expression.op).toBe('>=');
    }
  });

  it('should parse arithmetic expressions', async () => {
    const { expression } = await parseOclExpression('self.x + self.y * 2');
    expect(isBinaryExpression(expression)).toBe(true);
    if (isBinaryExpression(expression)) {
      expect(expression.op).toBe('+');
      expect(isBinaryExpression(expression.right)).toBe(true);
    }
  });

  it('should parse logical operators', async () => {
    const { expression } = await parseOclExpression('self.a and self.b or self.c');
    expect(isBinaryExpression(expression)).toBe(true);
    if (isBinaryExpression(expression)) {
      expect(expression.op).toBe('or');
    }
  });

  it('should parse implies', async () => {
    const { expression } = await parseOclExpression('self.a implies self.b');
    expect(isBinaryExpression(expression)).toBe(true);
    if (isBinaryExpression(expression)) {
      expect(expression.op).toBe('implies');
    }
  });

  it('should parse not expression', async () => {
    const { expression } = await parseOclExpression('not self.active');
    expect(isUnaryExpression(expression)).toBe(true);
    if (isUnaryExpression(expression)) {
      expect(expression.op).toBe('not');
    }
  });

  it('should parse unary minus', async () => {
    const { expression } = await parseOclExpression('-self.balance');
    expect(isUnaryExpression(expression)).toBe(true);
    if (isUnaryExpression(expression)) {
      expect(expression.op).toBe('-');
    }
  });

  it('should parse dot navigation', async () => {
    const { expression } = await parseOclExpression('self.name');
    expect(isDotExpression(expression)).toBe(true);
    if (isDotExpression(expression)) {
      expect(expression.feature).toBe('name');
      expect(isSelfExpression(expression.source)).toBe(true);
    }
  });

  it('should parse chained dot navigation', async () => {
    const { expression } = await parseOclExpression('self.company.name');
    expect(isDotExpression(expression)).toBe(true);
    if (isDotExpression(expression)) {
      expect(expression.feature).toBe('name');
      expect(isDotExpression(expression.source)).toBe(true);
    }
  });

  it('should parse arrow operations', async () => {
    const { expression } = await parseOclExpression('self.employees->size()');
    expect(isArrowExpression(expression)).toBe(true);
    if (isArrowExpression(expression)) {
      expect(expression.operation).toBe('size');
    }
  });

  it('should parse arrow with iterator', async () => {
    const { expression } = await parseOclExpression('self.employees->select(e | e.age > 30)');
    expect(isArrowExpression(expression)).toBe(true);
    if (isArrowExpression(expression)) {
      expect(expression.operation).toBe('select');
    }
  });

  it('should parse let expression', async () => {
    const { expression } = await parseOclExpression('let x = 5 in x + 1');
    expect(isLetExpression(expression)).toBe(true);
    if (isLetExpression(expression)) {
      expect(expression.name).toBe('x');
    }
  });

  it('should parse if expression', async () => {
    const { expression } = await parseOclExpression('if self.age >= 18 then true else false endif');
    expect(isIfExpression(expression)).toBe(true);
  });

  it('should parse collection literals', async () => {
    const { expression } = await parseOclExpression('Set{1, 2, 3}');
    expect(isCollectionLiteral(expression)).toBe(true);
    if (isCollectionLiteral(expression)) {
      expect(expression.kind).toBe('Set');
      expect(expression.items).toHaveLength(3);
    }
  });

  it('should parse collection range', async () => {
    const { expression } = await parseOclExpression('Sequence{1..5}');
    expect(isCollectionLiteral(expression)).toBe(true);
    if (isCollectionLiteral(expression)) {
      expect(expression.kind).toBe('Sequence');
      expect(expression.items).toHaveLength(1);
      expect(expression.items[0].last).toBeDefined();
    }
  });

  it('should parse tuple literal', async () => {
    const { expression } = await parseOclExpression("Tuple{name = 'John', age = 30}");
    expect(isTupleLiteral(expression)).toBe(true);
    if (isTupleLiteral(expression)) {
      expect(expression.parts).toHaveLength(2);
      expect(expression.parts[0].name).toBe('name');
    }
  });

  it('should parse variable reference', async () => {
    const { expression } = await parseOclExpression('myVar');
    expect(isVariableExpression(expression)).toBe(true);
    if (isVariableExpression(expression)) {
      expect(expression.name).toBe('myVar');
    }
  });

  it('should parse div and mod', async () => {
    const { expression } = await parseOclExpression('10 div 3');
    expect(isBinaryExpression(expression)).toBe(true);
    if (isBinaryExpression(expression)) {
      expect(expression.op).toBe('div');
    }
  });

  it('should parse dot method call with arguments', async () => {
    const { expression } = await parseOclExpression("self.name.substring(1, 3)");
    expect(isDotExpression(expression)).toBe(true);
    if (isDotExpression(expression)) {
      expect(expression.feature).toBe('substring');
      expect(expression.arguments).toHaveLength(2);
    }
  });

  it('should parse chained arrow operations', async () => {
    const { expression } = await parseOclExpression('self.employees->select(e | e.active)->size()');
    expect(isArrowExpression(expression)).toBe(true);
    if (isArrowExpression(expression)) {
      expect(expression.operation).toBe('size');
      expect(isArrowExpression(expression.source)).toBe(true);
    }
  });

  it('should parse xor expression', async () => {
    const { expression } = await parseOclExpression('self.a xor self.b');
    expect(isBinaryExpression(expression)).toBe(true);
    if (isBinaryExpression(expression)) {
      expect(expression.op).toBe('xor');
    }
  });

  it('should parse equality and inequality', async () => {
    const { expression: eq } = await parseOclExpression('self.x = 5');
    expect(isBinaryExpression(eq)).toBe(true);
    if (isBinaryExpression(eq)) expect(eq.op).toBe('=');

    const { expression: neq } = await parseOclExpression('self.x <> 5');
    expect(isBinaryExpression(neq)).toBe(true);
    if (isBinaryExpression(neq)) expect(neq.op).toBe('<>');
  });

  it('should parse qualified names', async () => {
    const result = await parseOcl('context mypackage::Person inv: self.age >= 0');
    expect(result.hasErrors).toBe(false);
    if (isClassifierContext(result.document.contexts[0])) {
      expect(result.document.contexts[0].type).toBe('mypackage::Person');
    }
  });
});

describe('OCL Grammar - Error Handling', () => {
  it('should report errors for invalid syntax', async () => {
    const result = await parseOcl('context inv:');
    expect(result.hasErrors).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should report errors for incomplete expressions', async () => {
    const result = await parseOcl('context Person inv: self. >=');
    expect(result.hasErrors).toBe(true);
  });
});
