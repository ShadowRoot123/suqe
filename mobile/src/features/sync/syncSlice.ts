import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import { outboxCount } from "@/sync/outbox";
import { getLastSyncChanges } from "@/sync/syncEngine";

export const refreshSyncBadges = createAsyncThunk("sync/refreshBadges", async () => {
  const [pending, changes] = await Promise.all([outboxCount("pending"), getLastSyncChanges()]);
  return { pendingCount: pending, changesCount: changes.length, refreshedAt: Date.now() };
});

type SyncState = {
  status: "idle" | "loading" | "failed";
  error: string | null;
  pendingCount: number;
  changesCount: number;
  refreshedAt: number | null;
};

const initialState: SyncState = {
  status: "idle",
  error: null,
  pendingCount: 0,
  changesCount: 0,
  refreshedAt: null,
};

const slice = createSlice({
  name: "sync",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(refreshSyncBadges.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(refreshSyncBadges.fulfilled, (state, action) => {
        state.status = "idle";
        state.pendingCount = action.payload.pendingCount;
        state.changesCount = action.payload.changesCount;
        state.refreshedAt = action.payload.refreshedAt;
      })
      .addCase(refreshSyncBadges.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error?.message ?? "Failed to refresh sync badges";
      });
  },
});

export default slice.reducer;

