import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

const TabsContext = createContext(null)

export function Tabs({ defaultValue, value: controlledValue, onValueChange, className = '', children }) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue)
  const value = controlledValue ?? uncontrolled
  const setValue = useCallback((v) => {
    if (controlledValue === undefined) setUncontrolled(v)
    onValueChange?.(v)
  }, [controlledValue, onValueChange])

  const context = useMemo(() => ({ value, setValue }), [value, setValue])
  return (
    <TabsContext.Provider value={context}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

export function TabsList({ className = '', children }) {
  return (
    <div className={`inline-flex items-center rounded bg-muted p-1 text-muted-foreground ${className}`}>
      {children}
    </div>
  )
}

export function TabsTrigger({ value, className = '', children }) {
  const ctx = useContext(TabsContext)
  const active = ctx?.value === value
  return (
    <button
      type="button"
      onClick={() => ctx?.setValue(value)}
      data-state={active ? 'active' : 'inactive'}
      className={`px-3 py-1 rounded transition-colors ${active ? 'bg-background text-foreground shadow' : ''} ${className}`}
    >
      {children}
    </button>
  )
}

export function TabsContent({ value, className = '', children }) {
  const ctx = useContext(TabsContext)
  if (ctx?.value !== value) return null
  return <div className={className}>{children}</div>
}


