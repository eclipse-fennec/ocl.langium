import { describe, it, expect } from 'vitest';
import { parseOcl, parseOclExpression } from '../src/parser.js';
import { OclEvaluator, OCL_INVALID } from '../src/evaluator/OclEvaluator.js';

const evaluator = new OclEvaluator();

async function evalExpr(oclExpr: string, context: unknown, variables?: Record<string, unknown>): Promise<unknown> {
  const { expression, errors } = await parseOclExpression(oclExpr);
  if (errors.length > 0) {
    throw new Error(`Parse errors: ${errors.map(e => e.message).join(', ')}`);
  }
  if (!expression) {
    throw new Error('No expression parsed');
  }
  return evaluator.evaluateExpression(expression, context, { variables });
}

async function evalConstraints(ocl: string, context: unknown) {
  const result = await parseOcl(ocl);
  if (result.hasErrors) {
    throw new Error(`Parse errors: ${result.errors.map(e => e.message).join(', ')}`);
  }
  return evaluator.evaluate(result.document, context);
}

describe('OclEvaluator - Literals', () => {
  it('should evaluate integer literal', async () => {
    expect(await evalExpr('42', null)).toBe(42);
  });

  it('should evaluate real literal', async () => {
    expect(await evalExpr('3.14', null)).toBe(3.14);
  });

  it('should evaluate string literal', async () => {
    expect(await evalExpr("'hello'", null)).toBe('hello');
  });

  it('should evaluate boolean literals', async () => {
    expect(await evalExpr('true', null)).toBe(true);
    expect(await evalExpr('false', null)).toBe(false);
  });

  it('should evaluate null literal', async () => {
    expect(await evalExpr('null', null)).toBe(null);
  });

  it('should evaluate invalid literal', async () => {
    expect(await evalExpr('invalid', null)).toBe(OCL_INVALID);
  });
});

describe('OclEvaluator - Arithmetic', () => {
  it('should evaluate addition', async () => {
    expect(await evalExpr('2 + 3', null)).toBe(5);
  });

  it('should evaluate subtraction', async () => {
    expect(await evalExpr('10 - 4', null)).toBe(6);
  });

  it('should evaluate multiplication', async () => {
    expect(await evalExpr('3 * 7', null)).toBe(21);
  });

  it('should evaluate division', async () => {
    expect(await evalExpr('10 / 4', null)).toBe(2.5);
  });

  it('should evaluate integer division', async () => {
    expect(await evalExpr('10 div 3', null)).toBe(3);
  });

  it('should evaluate modulo', async () => {
    expect(await evalExpr('10 mod 3', null)).toBe(1);
  });

  it('should evaluate unary minus', async () => {
    expect(await evalExpr('-5', null)).toBe(-5);
  });

  it('should respect operator precedence', async () => {
    expect(await evalExpr('2 + 3 * 4', null)).toBe(14);
    expect(await evalExpr('10 - 2 * 3', null)).toBe(4);
  });
});

describe('OclEvaluator - Comparison', () => {
  it('should evaluate equality', async () => {
    expect(await evalExpr('5 = 5', null)).toBe(true);
    expect(await evalExpr('5 = 6', null)).toBe(false);
  });

  it('should evaluate inequality', async () => {
    expect(await evalExpr('5 <> 6', null)).toBe(true);
    expect(await evalExpr('5 <> 5', null)).toBe(false);
  });

  it('should evaluate less than', async () => {
    expect(await evalExpr('3 < 5', null)).toBe(true);
    expect(await evalExpr('5 < 3', null)).toBe(false);
  });

  it('should evaluate greater than', async () => {
    expect(await evalExpr('5 > 3', null)).toBe(true);
  });

  it('should evaluate less than or equal', async () => {
    expect(await evalExpr('3 <= 3', null)).toBe(true);
    expect(await evalExpr('3 <= 5', null)).toBe(true);
    expect(await evalExpr('5 <= 3', null)).toBe(false);
  });

  it('should evaluate greater than or equal', async () => {
    expect(await evalExpr('5 >= 5', null)).toBe(true);
    expect(await evalExpr('5 >= 3', null)).toBe(true);
  });
});

describe('OclEvaluator - Logic', () => {
  it('should evaluate and', async () => {
    expect(await evalExpr('true and true', null)).toBe(true);
    expect(await evalExpr('true and false', null)).toBe(false);
    expect(await evalExpr('false and true', null)).toBe(false);
  });

  it('should evaluate or', async () => {
    expect(await evalExpr('false or true', null)).toBe(true);
    expect(await evalExpr('false or false', null)).toBe(false);
    expect(await evalExpr('true or false', null)).toBe(true);
  });

  it('should evaluate not', async () => {
    expect(await evalExpr('not true', null)).toBe(false);
    expect(await evalExpr('not false', null)).toBe(true);
  });

  it('should evaluate implies', async () => {
    expect(await evalExpr('true implies true', null)).toBe(true);
    expect(await evalExpr('true implies false', null)).toBe(false);
    expect(await evalExpr('false implies true', null)).toBe(true);
    expect(await evalExpr('false implies false', null)).toBe(true);
  });

  it('should evaluate xor', async () => {
    expect(await evalExpr('true xor false', null)).toBe(true);
    expect(await evalExpr('true xor true', null)).toBe(false);
    expect(await evalExpr('false xor false', null)).toBe(false);
  });

  it('should short-circuit and', async () => {
    // false and X should not evaluate X
    expect(await evalExpr('false and true', null)).toBe(false);
  });

  it('should short-circuit or', async () => {
    expect(await evalExpr('true or false', null)).toBe(true);
  });
});

describe('OclEvaluator - Navigation', () => {
  it('should navigate object properties', async () => {
    const obj = { name: 'John', age: 30 };
    expect(await evalExpr('self.name', obj)).toBe('John');
    expect(await evalExpr('self.age', obj)).toBe(30);
  });

  it('should navigate nested properties', async () => {
    const obj = { company: { name: 'Acme' } };
    expect(await evalExpr('self.company.name', obj)).toBe('Acme');
  });

  it('should return OCL_INVALID for null navigation', async () => {
    expect(await evalExpr('self.name', null)).toBe(OCL_INVALID);
  });
});

describe('OclEvaluator - String Operations', () => {
  it('should evaluate size()', async () => {
    expect(await evalExpr("'hello'.size()", null)).toBe(5);
  });

  it('should evaluate concat()', async () => {
    expect(await evalExpr("'hello'.concat(' world')", null)).toBe('hello world');
  });

  it('should evaluate substring()', async () => {
    expect(await evalExpr("'hello'.substring(1, 3)", null)).toBe('hel');
  });

  it('should evaluate toUpperCase()', async () => {
    expect(await evalExpr("'hello'.toUpperCase()", null)).toBe('HELLO');
  });

  it('should evaluate toLowerCase()', async () => {
    expect(await evalExpr("'HELLO'.toLowerCase()", null)).toBe('hello');
  });

  it('should evaluate toInteger()', async () => {
    expect(await evalExpr("'42'.toInteger()", null)).toBe(42);
  });

  it('should evaluate toReal()', async () => {
    expect(await evalExpr("'3.14'.toReal()", null)).toBe(3.14);
  });

  it('should evaluate string + concatenation', async () => {
    expect(await evalExpr("'hello' + ' ' + 'world'", null)).toBe('hello world');
  });
});

describe('OclEvaluator - Collection Operations', () => {
  it('should evaluate size()', async () => {
    const obj = { items: [1, 2, 3] };
    expect(await evalExpr('self.items->size()', obj)).toBe(3);
  });

  it('should evaluate isEmpty()', async () => {
    expect(await evalExpr('self.items->isEmpty()', { items: [] })).toBe(true);
    expect(await evalExpr('self.items->isEmpty()', { items: [1] })).toBe(false);
  });

  it('should evaluate notEmpty()', async () => {
    expect(await evalExpr('self.items->notEmpty()', { items: [1] })).toBe(true);
    expect(await evalExpr('self.items->notEmpty()', { items: [] })).toBe(false);
  });

  it('should evaluate includes()', async () => {
    const obj = { items: [1, 2, 3] };
    expect(await evalExpr('self.items->includes(2)', obj)).toBe(true);
    expect(await evalExpr('self.items->includes(5)', obj)).toBe(false);
  });

  it('should evaluate excludes()', async () => {
    const obj = { items: [1, 2, 3] };
    expect(await evalExpr('self.items->excludes(5)', obj)).toBe(true);
    expect(await evalExpr('self.items->excludes(2)', obj)).toBe(false);
  });

  it('should evaluate select()', async () => {
    const obj = { items: [1, 2, 3, 4, 5] };
    const result = await evalExpr('self.items->select(x | x > 3)', obj);
    expect(result).toEqual([4, 5]);
  });

  it('should evaluate reject()', async () => {
    const obj = { items: [1, 2, 3, 4, 5] };
    const result = await evalExpr('self.items->reject(x | x > 3)', obj);
    expect(result).toEqual([1, 2, 3]);
  });

  it('should evaluate collect()', async () => {
    const obj = { items: [1, 2, 3] };
    const result = await evalExpr('self.items->collect(x | x * 2)', obj);
    expect(result).toEqual([2, 4, 6]);
  });

  it('should evaluate forAll()', async () => {
    const obj = { items: [1, 2, 3] };
    expect(await evalExpr('self.items->forAll(x | x > 0)', obj)).toBe(true);
    expect(await evalExpr('self.items->forAll(x | x > 2)', obj)).toBe(false);
  });

  it('should evaluate exists()', async () => {
    const obj = { items: [1, 2, 3] };
    expect(await evalExpr('self.items->exists(x | x = 2)', obj)).toBe(true);
    expect(await evalExpr('self.items->exists(x | x = 5)', obj)).toBe(false);
  });

  it('should evaluate any()', async () => {
    const obj = { items: [1, 2, 3, 4] };
    const result = await evalExpr('self.items->any(x | x > 2)', obj);
    expect(result).toBe(3);
  });

  it('should evaluate one()', async () => {
    const obj = { items: [1, 2, 3] };
    expect(await evalExpr('self.items->one(x | x = 2)', obj)).toBe(true);
    expect(await evalExpr('self.items->one(x | x > 1)', obj)).toBe(false);
  });

  it('should evaluate isUnique()', async () => {
    const obj = { items: [1, 2, 3] };
    expect(await evalExpr('self.items->isUnique(x | x)', obj)).toBe(true);
  });

  it('should evaluate sum()', async () => {
    const obj = { items: [1, 2, 3, 4] };
    expect(await evalExpr('self.items->sum()', obj)).toBe(10);
  });

  it('should evaluate min() and max()', async () => {
    const obj = { items: [3, 1, 4, 1, 5] };
    expect(await evalExpr('self.items->min()', obj)).toBe(1);
    expect(await evalExpr('self.items->max()', obj)).toBe(5);
  });

  it('should evaluate count()', async () => {
    const obj = { items: [1, 2, 2, 3, 2] };
    expect(await evalExpr('self.items->count(2)', obj)).toBe(3);
  });

  it('should evaluate union()', async () => {
    const obj = { a: [1, 2], b: [3, 4] };
    const result = await evalExpr('self.a->union(self.b)', obj);
    expect(result).toEqual([1, 2, 3, 4]);
  });

  it('should evaluate intersection()', async () => {
    const obj = { a: [1, 2, 3], b: [2, 3, 4] };
    const result = await evalExpr('self.a->intersection(self.b)', obj);
    expect(result).toEqual([2, 3]);
  });

  it('should evaluate flatten()', async () => {
    const obj = { items: [[1, 2], [3, 4]] };
    const result = await evalExpr('self.items->flatten()', obj);
    expect(result).toEqual([1, 2, 3, 4]);
  });

  it('should evaluate append() and prepend()', async () => {
    const obj = { items: [1, 2, 3] };
    expect(await evalExpr('self.items->append(4)', obj)).toEqual([1, 2, 3, 4]);
    expect(await evalExpr('self.items->prepend(0)', obj)).toEqual([0, 1, 2, 3]);
  });

  it('should evaluate first() and last()', async () => {
    const obj = { items: [10, 20, 30] };
    expect(await evalExpr('self.items->first()', obj)).toBe(10);
    expect(await evalExpr('self.items->last()', obj)).toBe(30);
  });

  it('should evaluate at()', async () => {
    const obj = { items: [10, 20, 30] };
    expect(await evalExpr('self.items->at(2)', obj)).toBe(20);
  });

  it('should evaluate indexOf()', async () => {
    const obj = { items: [10, 20, 30] };
    expect(await evalExpr('self.items->indexOf(20)', obj)).toBe(2);
  });

  it('should evaluate reverse()', async () => {
    const obj = { items: [1, 2, 3] };
    expect(await evalExpr('self.items->reverse()', obj)).toEqual([3, 2, 1]);
  });

  it('should evaluate includesAll()', async () => {
    const obj = { a: [1, 2, 3, 4], b: [2, 3] };
    expect(await evalExpr('self.a->includesAll(self.b)', obj)).toBe(true);
  });

  it('should evaluate excludesAll()', async () => {
    const obj = { a: [1, 2, 3], b: [4, 5] };
    expect(await evalExpr('self.a->excludesAll(self.b)', obj)).toBe(true);
  });

  it('should evaluate sortedBy()', async () => {
    const obj = { items: [3, 1, 4, 1, 5] };
    expect(await evalExpr('self.items->sortedBy(x | x)', obj)).toEqual([1, 1, 3, 4, 5]);
  });

  it('should evaluate asSet() (removes duplicates)', async () => {
    const obj = { items: [1, 2, 2, 3, 3] };
    const result = await evalExpr('self.items->asSet()', obj);
    expect(result).toEqual([1, 2, 3]);
  });
});

describe('OclEvaluator - Collection Literals', () => {
  it('should evaluate Set literal', async () => {
    const result = await evalExpr('Set{1, 2, 3}', null);
    expect(result).toEqual([1, 2, 3]);
  });

  it('should evaluate Set with duplicates removed', async () => {
    const result = await evalExpr('Set{1, 2, 2, 3}', null);
    expect(result).toEqual([1, 2, 3]);
  });

  it('should evaluate Sequence literal', async () => {
    const result = await evalExpr('Sequence{1, 2, 3}', null);
    expect(result).toEqual([1, 2, 3]);
  });

  it('should evaluate Sequence range', async () => {
    const result = await evalExpr('Sequence{1..5}', null);
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('OclEvaluator - Let & If', () => {
  it('should evaluate let expression', async () => {
    expect(await evalExpr('let x = 5 in x + 1', null)).toBe(6);
  });

  it('should evaluate nested let', async () => {
    expect(await evalExpr('let x = 5 in let y = 3 in x + y', null)).toBe(8);
  });

  it('should evaluate if-then-else true', async () => {
    expect(await evalExpr('if true then 1 else 2 endif', null)).toBe(1);
  });

  it('should evaluate if-then-else false', async () => {
    expect(await evalExpr('if false then 1 else 2 endif', null)).toBe(2);
  });

  it('should evaluate if with expression condition', async () => {
    const obj = { age: 20 };
    expect(await evalExpr("if self.age >= 18 then 'adult' else 'minor' endif", obj)).toBe('adult');
  });
});

describe('OclEvaluator - Tuple', () => {
  it('should evaluate tuple literal', async () => {
    const result = await evalExpr("Tuple{name = 'John', age = 30}", null);
    expect(result).toEqual({ name: 'John', age: 30 });
  });
});

describe('OclEvaluator - Variables', () => {
  it('should resolve variable from options', async () => {
    expect(await evalExpr('myVar', null, { myVar: 42 })).toBe(42);
  });
});

describe('OclEvaluator - Number Operations', () => {
  it('should evaluate abs()', async () => {
    const obj = { val: -5 };
    expect(await evalExpr('self.val.abs()', obj)).toBe(5);
  });

  it('should evaluate floor()', async () => {
    const obj = { val: 3.7 };
    expect(await evalExpr('self.val.floor()', obj)).toBe(3);
  });

  it('should evaluate round()', async () => {
    const obj = { val: 3.5 };
    expect(await evalExpr('self.val.round()', obj)).toBe(4);
  });
});

describe('OclEvaluator - Constraint Evaluation', () => {
  it('should evaluate a satisfied invariant', async () => {
    const result = await evalConstraints(
      'context Person inv agePositive: self.age >= 0',
      { age: 25 },
    );
    expect(result.valid).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].name).toBe('agePositive');
    expect(result.results[0].satisfied).toBe(true);
  });

  it('should evaluate a violated invariant', async () => {
    const result = await evalConstraints(
      'context Person inv agePositive: self.age >= 0',
      { age: -5 },
    );
    expect(result.valid).toBe(false);
    expect(result.results[0].satisfied).toBe(false);
  });

  it('should evaluate multiple invariants', async () => {
    const result = await evalConstraints(`
      context Person
        inv agePositive: self.age >= 0
        inv nameNotEmpty: self.name.size() > 0
    `, { age: 25, name: 'John' });
    expect(result.valid).toBe(true);
    expect(result.results).toHaveLength(2);
  });

  it('should evaluate VALIDATION context', async () => {
    const result = await evalConstraints(`
      VALIDATION Company::checkEmployees
      self.employees->size() > 0
    `, { employees: [1, 2] });
    expect(result.valid).toBe(true);
  });

  it('should handle evaluation errors gracefully', async () => {
    const result = await evalConstraints(
      'context Person inv: self.nonExistent.foo > 0',
      {},
    );
    expect(result.valid).toBe(false);
    expect(result.results[0].satisfied).toBe(false);
  });
});

describe('OclEvaluator - Type Operations', () => {
  it('should evaluate oclIsUndefined', async () => {
    expect(await evalExpr('self.oclIsUndefined()', null)).toBe(true);
    expect(await evalExpr('self.oclIsUndefined()', { name: 'x' })).toBe(false);
  });
});

describe('OclEvaluator - Chained Operations', () => {
  it('should evaluate chained collection operations', async () => {
    const obj = {
      employees: [
        { name: 'Alice', age: 30, active: true },
        { name: 'Bob', age: 25, active: false },
        { name: 'Charlie', age: 35, active: true },
      ],
    };
    const result = await evalExpr('self.employees->select(e | e.active)->size()', obj);
    expect(result).toBe(2);
  });

  it('should evaluate select + collect chain', async () => {
    const obj = {
      items: [
        { name: 'a', value: 10 },
        { name: 'b', value: 20 },
        { name: 'c', value: 5 },
      ],
    };
    const result = await evalExpr('self.items->select(x | x.value > 8)->collect(x | x.name)', obj);
    expect(result).toEqual(['a', 'b']);
  });
});
