import type {
  EPackage,
  EClass,
  EStructuralFeature,
  EClassifier,
  EOperation,
  EReference,
  EAttribute,
} from '@emfts/core';

export class OclEmfBridge {
  private packages: Map<string, EPackage> = new Map();
  private classByName: Map<string, EClass> = new Map();

  registerPackage(pkg: EPackage): void {
    const nsURI = pkg.getNsURI();
    if (nsURI) {
      this.packages.set(nsURI, pkg);
    }
    this.indexClassifiers(pkg);
  }

  unregisterPackage(nsURI: string): void {
    const pkg = this.packages.get(nsURI);
    if (pkg) {
      this.packages.delete(nsURI);
      this.removeClassifiers(pkg);
    }
  }

  private indexClassifiers(pkg: EPackage): void {
    const classifiers = pkg.getEClassifiers();
    if (classifiers) {
      for (let i = 0; i < classifiers.size(); i++) {
        const classifier = classifiers.get(i);
        if (classifier && isEClass(classifier)) {
          const name = classifier.getName();
          if (name) {
            this.classByName.set(name, classifier);
            const pkgName = pkg.getName();
            if (pkgName) {
              this.classByName.set(`${pkgName}::${name}`, classifier);
            }
          }
        }
      }
    }
    const subPackages = pkg.getESubpackages();
    if (subPackages) {
      for (let i = 0; i < subPackages.size(); i++) {
        const sub = subPackages.get(i);
        if (sub) {
          this.indexClassifiers(sub);
        }
      }
    }
  }

  private removeClassifiers(pkg: EPackage): void {
    const classifiers = pkg.getEClassifiers();
    if (classifiers) {
      for (let i = 0; i < classifiers.size(); i++) {
        const classifier = classifiers.get(i);
        if (classifier) {
          const name = classifier.getName();
          if (name) {
            this.classByName.delete(name);
            const pkgName = pkg.getName();
            if (pkgName) {
              this.classByName.delete(`${pkgName}::${name}`);
            }
          }
        }
      }
    }
  }

  resolveClass(qualifiedName: string): EClass | undefined {
    return this.classByName.get(qualifiedName);
  }

  getAllClasses(): EClass[] {
    const seen = new Set<EClass>();
    const result: EClass[] = [];
    for (const cls of this.classByName.values()) {
      if (!seen.has(cls)) {
        seen.add(cls);
        result.push(cls);
      }
    }
    return result;
  }

  getFeaturesForClass(eClass: EClass): EStructuralFeature[] {
    return eClass.getEAllStructuralFeatures() ?? [];
  }

  getAttributesForClass(eClass: EClass): EAttribute[] {
    return eClass.getEAllAttributes() ?? [];
  }

  getReferencesForClass(eClass: EClass): EReference[] {
    return eClass.getEAllReferences() ?? [];
  }

  getOperationsForClass(eClass: EClass): EOperation[] {
    return eClass.getEAllOperations() ?? [];
  }

  inferFeatureType(eClass: EClass, featureName: string): EClassifier | undefined {
    const features = this.getFeaturesForClass(eClass);
    for (const f of features) {
      if (f.getName() === featureName) {
        return f.getEType() ?? undefined;
      }
    }
    return undefined;
  }

  getRegisteredPackages(): EPackage[] {
    return Array.from(this.packages.values());
  }
}

function isEClass(classifier: EClassifier): classifier is EClass {
  return 'getEStructuralFeatures' in classifier && typeof (classifier as EClass).getEStructuralFeatures === 'function';
}
