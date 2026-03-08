import React, { createContext, useContext, useState, useMemo } from 'react';

export type OperationFilter = 'Blair' | 'Snyder' | 'Both';

interface OperationContextValue {
  operation: OperationFilter;
  setOperation: (op: OperationFilter) => void;
}

const OperationContext = createContext<OperationContextValue>({
  operation: 'Blair',
  setOperation: () => {},
});

export function OperationProvider({ children }: { children: React.ReactNode }) {
  const [operation, setOperation] = useState<OperationFilter>('Blair');
  const value = useMemo(() => ({ operation, setOperation }), [operation]);
  return (
    <OperationContext.Provider value={value}>
      {children}
    </OperationContext.Provider>
  );
}

export function useOperation() {
  return useContext(OperationContext);
}
