import React from "react";

import { useAppDispatch, useAppSelector } from "@/store";

import { refreshSyncBadges } from "../syncSlice";

export function useSyncBadges() {
  const dispatch = useAppDispatch();
  const pendingCount = useAppSelector((s) => s.sync.pendingCount);
  const changesCount = useAppSelector((s) => s.sync.changesCount);
  const status = useAppSelector((s) => s.sync.status);

  const refresh = React.useCallback(async () => {
    await dispatch(refreshSyncBadges()).unwrap();
  }, [dispatch]);

  return { pendingCount, changesCount, status, refresh };
}

