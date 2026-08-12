import { useState, useEffect, useMemo, useCallback } from 'react';

/**
 * Custom helper for deep comparison of objects, arrays, and primitive values.
 */
export function isDeepEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true;
  if (obj1 == null || obj2 == null) return obj1 === obj2;
  if (typeof obj1 !== typeof obj2) return false;

  if (typeof obj1 !== 'object') {
    return String(obj1) === String(obj2);
  }

  if (Array.isArray(obj1) !== Array.isArray(obj2)) return false;

  if (Array.isArray(obj1)) {
    if (obj1.length !== obj2.length) return false;
    for (let i = 0; i < obj1.length; i++) {
      if (!isDeepEqual(obj1[i], obj2[i])) return false;
    }
    return true;
  }

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    if (!Object.prototype.hasOwnProperty.call(obj2, key)) return false;
    if (!isDeepEqual(obj1[key], obj2[key])) return false;
  }

  return true;
}

/**
 * Hook centralizado de control de estado para formularios (Pristine vs Dirty).
 * 
 * Devuelve `isDirty` (true cuando hay cambios no guardados respecto a la base inicial)
 * e `isPristine` (true cuando el formulario está idéntico a la base inicial).
 * 
 * Mantiene la regla:
 * - Botón Guardar deshabilitado si `isPristine` o `!isDirty`
 * - Tras guardar exitosamente se llama a `markSaved()` para actualizar la base
 * - Al cancelar se puede usar `resetToInitial()`
 */
export function useFormPristine<T extends Record<string, any> | any>(initialState: T, currentState: T) {
  const [baseState, setBaseState] = useState<T>(initialState);

  useEffect(() => {
    setBaseState(initialState);
  }, [JSON.stringify(initialState)]);

  const isDirty = useMemo(() => {
    return !isDeepEqual(baseState, currentState);
  }, [baseState, currentState]);

  const isPristine = !isDirty;

  const markSaved = useCallback((newBase?: T) => {
    setBaseState(newBase !== undefined ? newBase : currentState);
  }, [currentState]);

  const resetToInitial = useCallback(() => {
    return baseState;
  }, [baseState]);

  return {
    isDirty,
    isPristine,
    markSaved,
    resetToInitial,
    baseState
  };
}
