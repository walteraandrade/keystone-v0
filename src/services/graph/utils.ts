export const toJsNumber = (val: unknown): number => {
  return typeof val === 'number' ? val : ((val as any)?.toNumber?.() || 0);
};




