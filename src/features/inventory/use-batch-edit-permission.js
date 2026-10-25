import { useCallback, useEffect, useMemo, useState } from 'react';
import { createBatchEditPolicy } from './batch-edit-policy.js';

export default function useBatchEditPermission(account, batches, purchases) {
  const policy = useMemo(() => createBatchEditPolicy(purchases), [purchases]);
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    const now = Date.now();
    const deadlines = batches.map(batch => policy.deadline(account, batch)).filter(value => value > now);
    if (!deadlines.length) return;
    const timer = setTimeout(() => setClock(Date.now()), Math.min(...deadlines) - now + 1);
    return () => clearTimeout(timer);
  }, [account, batches, policy, clock]);
  return useCallback(batch => policy.canEdit(account, batch, Math.max(clock, Date.now())), [account, policy, clock]);
}
