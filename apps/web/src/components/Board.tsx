import { useCallback, useRef } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import type { EventItem, JobSummary } from "@job-tracker/shared/api";
import {
  ACTIVE_STATUSES,
  STATUS_ACCENT,
  STATUS_LABEL,
  isBackwardMove,
  isDroppable,
  isTerminal,
  type FunnelEvent,
  type Status,
} from "@job-tracker/shared/funnel";
import { useCorrectStatus } from "../hooks";
import { usePersistentStringSet } from "../lib/persist";
import { Column } from "./Column";
import type { NavDir } from "./JobCard";

interface Props {
  jobs: JobSummary[];
  onOpen: (jobId: string) => void;
  onEvent: (jobId: string, events: EventItem[]) => void;
}

// Stable id for the combined terminal column (which has no single status) so its
// collapsed state persists alongside the active columns' status-keyed ids.
const CLOSED_OUT = "closed_out";

export function Board({ jobs, onOpen, onEvent }: Props) {
  // A small drag threshold so clicks, and the card's own buttons, still register as
  // clicks rather than starting a drag. Drag is pointer-only by design: a keyboard
  // funnel move goes through the drawer's Move / Correct controls, which carry a note
  // and enforce the same guards. dnd-kit's keyboard sensor only ships a sortable-list
  // coordinate getter, walking cards in DOM order rather than spatially.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const correctStatus = useCorrectStatus();

  // Which columns are collapsed to a rail — a persisted view preference, empty
  // (all expanded) by default.
  const [collapsed, toggleCollapsed] = usePersistentStringSet("jt.collapsedColumns");

  const byStatus = (s: Status) => jobs.filter((j) => j.status === s);
  const terminalJobs = jobs.filter((j) => isTerminal(j.status));

  // navigate must stay referentially stable for React.memo(JobCard) to hold — a fresh
  // callback each render would re-render every card on any board change. It reads
  // jobs/collapsed through refs rather than closing over them, so its identity never
  // changes even as those do.
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;

  // Move keyboard focus card-to-card. Up/down walk a column; left/right jump to the
  // nearest card in the next expanded, non-empty column, clamping the row so a short
  // column doesn't lose you. The board owns this as the only place that knows the
  // column order and which are collapsed.
  const navigate = useCallback((fromId: string, dir: NavDir) => {
    const jobs = jobsRef.current;
    const collapsed = collapsedRef.current;
    const cols = [
      ...ACTIVE_STATUSES.map((s) => ({
        jobs: jobs.filter((j) => j.status === s),
        collapsed: collapsed.has(s),
      })),
      { jobs: jobs.filter((j) => isTerminal(j.status)), collapsed: collapsed.has(CLOSED_OUT) },
    ];
    let c = -1;
    let r = -1;
    for (let i = 0; i < cols.length; i++) {
      const idx = cols[i].jobs.findIndex((j) => j.id === fromId);
      if (idx !== -1) {
        c = i;
        r = idx;
        break;
      }
    }
    if (c === -1) return;

    let targetId: string | undefined;
    if (dir === "up") targetId = cols[c].jobs[r - 1]?.id;
    else if (dir === "down") targetId = cols[c].jobs[r + 1]?.id;
    else {
      const step = dir === "left" ? -1 : 1;
      for (let i = c + step; i >= 0 && i < cols.length; i += step) {
        const col = cols[i];
        if (col.collapsed || col.jobs.length === 0) continue;
        targetId = col.jobs[Math.min(r, col.jobs.length - 1)].id;
        break;
      }
    }
    if (targetId) {
      document.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(targetId)}"]`)?.focus();
    }
  }, []);

  function onDragEnd(e: DragEndEvent) {
    const jobId = String(e.active.id);
    const target = e.over?.id;
    if (target == null) return;
    const targetStatus = String(target);
    if (!isDroppable(targetStatus)) return;
    const job = jobs.find((j) => j.id === jobId);
    if (!job || job.status === targetStatus) return;
    // Dragging a card to an earlier column, or out of a terminal, isn't an organic
    // move — the server rejects it as a funnel downgrade. It's a deliberate
    // correction, so route it through the correction endpoint.
    if (isBackwardMove(job.status, targetStatus)) {
      correctStatus.mutate({ jobId, status: targetStatus as Status });
      return;
    }
    onEvent(jobId, [{ event: targetStatus as FunnelEvent }]);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex h-full gap-3 overflow-x-auto p-4">
        {ACTIVE_STATUSES.map((s) => (
          <Column
            key={s}
            // `new` isn't a drop target (no event enters it); the rest are.
            droppableId={isDroppable(s) ? s : undefined}
            label={STATUS_LABEL[s]}
            accentDot={STATUS_ACCENT[s].dot}
            accentText={STATUS_ACCENT[s].text}
            jobs={byStatus(s)}
            collapsed={collapsed.has(s)}
            onToggleCollapse={() => toggleCollapsed(s)}
            onOpen={onOpen}
            onEvent={onEvent}
            onNavigate={navigate}
          />
        ))}
        <Column
          label="Closed out"
          accentDot={STATUS_ACCENT.closed.dot}
          accentText={STATUS_ACCENT.closed.text}
          jobs={terminalJobs}
          collapsed={collapsed.has(CLOSED_OUT)}
          onToggleCollapse={() => toggleCollapsed(CLOSED_OUT)}
          onOpen={onOpen}
          onEvent={onEvent}
          onNavigate={navigate}
        />
      </div>
    </DndContext>
  );
}
