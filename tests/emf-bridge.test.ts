import { describe, it, expect, beforeEach } from 'vitest';
import { OclEmfBridge } from '../src/language/ocl-emf-bridge.js';
import type { EPackage, EClass, EClassifier, EStructuralFeature, EAttribute, EReference, EOperation } from 'emfts';
import type { EList } from 'emfts';

// Minimal mock implementations for testing
function createMockEList<T>(items: T[]): EList<T> {
  return {
    size: () => items.length,
    get: (i: number) => items[i],
    isEmpty: () => items.length === 0,
    contains: (item: T) => items.includes(item),
    [Symbol.iterator]: function* () { yield* items; },
    indexOf: (item: T) => items.indexOf(item),
    toArray: () => [...items],
    add: () => { throw new Error('not implemented'); },
    addAll: () => { throw new Error('not implemented'); },
    remove: () => { throw new Error('not implemented'); },
    clear: () => { throw new Error('not implemented'); },
    set: () => { throw new Error('not implemented'); },
    move: () => { throw new Error('not implemented'); },
  } as unknown as EList<T>;
}

function createMockAttribute(name: string, typeName: string): EAttribute {
  const type = { getName: () => typeName } as EClassifier;
  return {
    getName: () => name,
    getEType: () => type,
    isID: () => false,
    setID: () => {},
    getEAttributeType: () => null,
  } as unknown as EAttribute;
}

function createMockReference(name: string, targetName: string): EReference {
  const target = { getName: () => targetName } as unknown as EClass;
  return {
    getName: () => name,
    getEType: () => target,
    getEReferenceType: () => target,
    isContainment: () => false,
  } as unknown as EReference;
}

function createMockOperation(name: string): EOperation {
  return {
    getName: () => name,
    getEType: () => null,
    getEParameters: () => createMockEList([]),
  } as unknown as EOperation;
}

function createMockEClass(name: string, attrs: EAttribute[] = [], refs: EReference[] = [], ops: EOperation[] = []): EClass {
  const allFeatures: EStructuralFeature[] = [...attrs, ...refs];
  return {
    getName: () => name,
    getEStructuralFeatures: () => createMockEList(allFeatures),
    getEAllStructuralFeatures: () => allFeatures,
    getEAttributes: () => createMockEList(attrs),
    getEAllAttributes: () => attrs,
    getEReferences: () => createMockEList(refs),
    getEAllReferences: () => refs,
    getEOperations: () => createMockEList(ops),
    getEAllOperations: () => ops,
    getESuperTypes: () => createMockEList([]),
    getEAllSuperTypes: () => createMockEList([]),
    isAbstract: () => false,
    isInterface: () => false,
    getEPackage: () => null,
    getClassifierID: () => 0,
  } as unknown as EClass;
}

function createMockPackage(name: string, nsURI: string, classes: EClass[]): EPackage {
  return {
    getName: () => name,
    getNsURI: () => nsURI,
    getNsPrefix: () => name,
    getEClassifiers: () => createMockEList(classes as unknown as EClassifier[]),
    getESubpackages: () => createMockEList([]),
    getEFactoryInstance: () => null,
    getEClassifier: (n: string) => classes.find(c => c.getName() === n) as unknown as EClassifier ?? null,
  } as unknown as EPackage;
}

describe('OclEmfBridge', () => {
  let bridge: OclEmfBridge;

  const nameAttr = createMockAttribute('name', 'EString');
  const ageAttr = createMockAttribute('age', 'EInt');
  const companyRef = createMockReference('company', 'Company');
  const greetOp = createMockOperation('greet');

  const personClass = createMockEClass('Person', [nameAttr, ageAttr], [companyRef], [greetOp]);
  const companyClass = createMockEClass('Company', [createMockAttribute('companyName', 'EString')], [], []);

  const testPackage = createMockPackage('test', 'http://test/1.0', [personClass, companyClass]);

  beforeEach(() => {
    bridge = new OclEmfBridge();
  });

  describe('registerPackage', () => {
    it('should register a package and index classes', () => {
      bridge.registerPackage(testPackage);
      expect(bridge.resolveClass('Person')).toBe(personClass);
      expect(bridge.resolveClass('Company')).toBe(companyClass);
    });

    it('should support qualified name lookup', () => {
      bridge.registerPackage(testPackage);
      expect(bridge.resolveClass('test::Person')).toBe(personClass);
    });

    it('should return undefined for unknown class', () => {
      bridge.registerPackage(testPackage);
      expect(bridge.resolveClass('Unknown')).toBeUndefined();
    });
  });

  describe('unregisterPackage', () => {
    it('should unregister a package', () => {
      bridge.registerPackage(testPackage);
      expect(bridge.resolveClass('Person')).toBe(personClass);

      bridge.unregisterPackage('http://test/1.0');
      expect(bridge.resolveClass('Person')).toBeUndefined();
    });
  });

  describe('getAllClasses', () => {
    it('should return all unique classes', () => {
      bridge.registerPackage(testPackage);
      const classes = bridge.getAllClasses();
      expect(classes).toHaveLength(2);
      expect(classes).toContain(personClass);
      expect(classes).toContain(companyClass);
    });

    it('should return empty array when no packages registered', () => {
      expect(bridge.getAllClasses()).toHaveLength(0);
    });
  });

  describe('getFeaturesForClass', () => {
    it('should return all structural features', () => {
      bridge.registerPackage(testPackage);
      const features = bridge.getFeaturesForClass(personClass);
      expect(features).toHaveLength(3); // name, age, company
    });
  });

  describe('getAttributesForClass', () => {
    it('should return attributes', () => {
      const attrs = bridge.getAttributesForClass(personClass);
      expect(attrs).toHaveLength(2);
    });
  });

  describe('getReferencesForClass', () => {
    it('should return references', () => {
      const refs = bridge.getReferencesForClass(personClass);
      expect(refs).toHaveLength(1);
      expect(refs[0].getName()).toBe('company');
    });
  });

  describe('getOperationsForClass', () => {
    it('should return operations', () => {
      const ops = bridge.getOperationsForClass(personClass);
      expect(ops).toHaveLength(1);
      expect(ops[0].getName()).toBe('greet');
    });
  });

  describe('inferFeatureType', () => {
    it('should infer type of a feature', () => {
      bridge.registerPackage(testPackage);
      const type = bridge.inferFeatureType(personClass, 'name');
      expect(type).toBeDefined();
      expect(type?.getName()).toBe('EString');
    });

    it('should return undefined for unknown feature', () => {
      bridge.registerPackage(testPackage);
      const type = bridge.inferFeatureType(personClass, 'unknown');
      expect(type).toBeUndefined();
    });
  });

  describe('getRegisteredPackages', () => {
    it('should return registered packages', () => {
      bridge.registerPackage(testPackage);
      const packages = bridge.getRegisteredPackages();
      expect(packages).toHaveLength(1);
      expect(packages[0]).toBe(testPackage);
    });
  });
});
