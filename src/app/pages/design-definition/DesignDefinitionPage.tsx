import { useNavigate } from "react-router-dom";
import { useMemo } from "react";
import {
  AlertTriangle,
  Boxes,
  Cable,
  CircuitBoard,
  FileText,
  GitBranch,
  Layers3,
  RefreshCw,
} from "lucide-react";
import { WorkspaceProvider, type ReviewFilter } from "./WorkspaceContext";
import { useWorkspace } from "./workspaceStore";
import { ArchitecturePage } from "../architecture/ArchitecturePage";
import { RequirementsPage } from "../requirements/RequirementsPage";
import { ReviewPage } from "../review/ReviewPage";
import { SubsystemsPage } from "../subsystems/SubsystemsPage";
import type {
  DesignDefinitionResponse,
  DesignDefinitionReviewItem,
  DesignLens,
  SelectedEntity,
} from "@/app/services/api/legacy";
import { cn } from "@/app/shared/components/ui/utils";

const LENSES: Array<{ id: DesignLens; label: string }> = [
  { id: "architecture", label: "Architecture" },
  { id: "requirements", label: "Requirements" },
  { id: "subsystems", label: "Subsystems" },
  { id: "interfaces", label: "Interfaces" },
  { id: "review", label: "Review" },
];

function entityKey(entity: SelectedEntity | null) {
  return entity ? `${entity.type}:${entity.id}` : "";
}

function uniqueComponentGroups(parts: DesignDefinitionResponse["parts"]) {
  const groups = new Map<string, DesignDefinitionResponse["parts"][number]>();
  for (const part of parts) {
    const key =
      part.mpn || part.designator
        ? `${part.mpn || ""}|${part.designator || ""}`
        : `__anonymous__:${part.design_part_id}`;
    if (!groups.has(key)) groups.set(key, part);
  }
  return [...groups.values()];
}

function LensTabs() {
  const { activeLens, setActiveLens } = useWorkspace();
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1">
      {LENSES.map((lens) => (
        <button
          key={lens.id}
          type="button"
          onClick={() => setActiveLens(lens.id)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition",
            activeLens === lens.id
              ? "bg-slate-950 text-white shadow-sm"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
          )}
        >
          {lens.label}
        </button>
      ))}
    </div>
  );
}

function Header() {
  const { definition, isLoading, refresh } = useWorkspace();
  const blockerCount =
    definition?.review_items.filter((item) => item.severity === "blocking")
      .length || 0;
  const warningCount =
    definition?.review_items.filter((item) => item.severity === "warning")
      .length || 0;
  return (
    <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <CircuitBoard className="h-4 w-4" />
            Design Definition
          </div>
          <h1 className="mt-0.5 text-xl font-semibold text-slate-950">
            {definition?.review.project_name || "Unified design workspace"}
          </h1>
          <p className="mt-0.5 text-xs text-slate-600">
            One read model for parts, architecture, subsystems, interfaces,
            requirements, and review.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <span className="font-semibold text-slate-950">{blockerCount}</span>
            <span className="ml-1 text-slate-500">blockers</span>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <span className="font-semibold text-slate-950">{warningCount}</span>
            <span className="ml-1 text-slate-500">warnings</span>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>
      <div className="mt-3">
        <LensTabs />
      </div>
    </header>
  );
}

function DesignTree() {
  const { definition, selectedEntity, setSelectedEntity, setActiveLens } =
    useWorkspace();
  const partRows = definition?.parts;
  const { componentGroups, physicalInstances } = useMemo(() => {
    const parts = partRows || [];
    const groups = uniqueComponentGroups(parts);
    return {
      componentGroups: groups,
      physicalInstances: parts.reduce(
        (sum, part) => sum + (part.quantity || 1),
        0,
      ),
    };
  }, [partRows]);
  if (!definition) return null;
  const selectedKey = entityKey(selectedEntity);
  const treeItems: Array<{
    label: string;
    count: number;
    lens: DesignLens;
    icon: typeof Boxes;
    entity?: SelectedEntity;
  }> = [
    {
      label: "Component Groups",
      count: componentGroups.length,
      lens: "architecture",
      icon: Boxes,
    },
    {
      label: "Physical Instances",
      count: physicalInstances,
      lens: "architecture",
      icon: Boxes,
    },
    {
      label: "Connections",
      count: definition.connections.length,
      lens: "architecture",
      icon: Cable,
    },
    {
      label: "Subsystems",
      count: definition.subsystems.length,
      lens: "subsystems",
      icon: Layers3,
    },
    {
      label: "Interfaces",
      count: definition.interfaces.length,
      lens: "interfaces",
      icon: GitBranch,
    },
    {
      label: "Requirements",
      count: definition.design_requirements.length,
      lens: "requirements",
      icon: FileText,
    },
  ];
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        Design Tree
      </h2>
      <div className="mt-3 space-y-1">
        {treeItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                setActiveLens(item.lens);
                if (item.entity) setSelectedEntity(item.entity);
              }}
              className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <span className="inline-flex items-center gap-2">
                <Icon className="h-4 w-4 text-slate-400" />
                {item.label}
              </span>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {item.count}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-4 border-t border-slate-100 pt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Quick Select
        </h3>
        <div className="mt-2 max-h-48 space-y-1 overflow-auto pr-1">
          {definition.subsystems.slice(0, 8).map((subsystem) => {
            const key = `subsystem:${subsystem.subsystem_id}`;
            return (
              <button
                key={subsystem.subsystem_id}
                type="button"
                onClick={() => {
                  setActiveLens("subsystems");
                  setSelectedEntity({
                    type: "subsystem",
                    id: subsystem.subsystem_id,
                  });
                }}
                className={cn(
                  "w-full rounded-md px-2 py-1.5 text-left text-xs",
                  selectedKey === key
                    ? "bg-slate-950 text-white"
                    : "text-slate-600 hover:bg-slate-50",
                )}
              >
                {subsystem.subsystem_key ? `${subsystem.subsystem_key} ` : ""}
                {subsystem.name}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ReviewQueue() {
  const navigate = useNavigate();
  const {
    activeLens,
    definition,
    designId,
    reviewFilter,
    selectedEntity,
    setActiveLens,
    setReviewFilter,
    setSelectedEntity,
  } = useWorkspace();
  if (!definition) return null;
  const items = definition.review_items.filter(
    (item) => reviewFilter === "all" || item.severity === reviewFilter,
  );
  const filters: ReviewFilter[] = ["all", "blocking", "warning"];
  const routeForSource = (source: DesignDefinitionReviewItem["source"]) => {
    if (source === "architecture")
      return `/architecture?session=${encodeURIComponent(designId)}`;
    if (source === "subsystems")
      return `/subsystems?session=${encodeURIComponent(designId)}`;
    return `/review?session=${encodeURIComponent(designId)}`;
  };
  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Review Queue
        </h2>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          {items.length}
        </span>
      </div>
      <div className="mt-3 flex gap-1">
        {filters.map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setReviewFilter(filter)}
            className={cn(
              "rounded px-2 py-1 text-xs font-medium capitalize",
              reviewFilter === filter
                ? "bg-slate-950 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {filter}
          </button>
        ))}
      </div>
      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
        {items.length === 0 ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            No review items for this filter.
          </div>
        ) : (
          items.map((item, index) => {
            const isFocused =
              item.focus &&
              activeLens === item.focus.lens &&
              entityKey(selectedEntity) ===
                `${item.focus.entity_type}:${item.focus.entity_id}`;
            return (
              <article
                key={`${item.source}-${item.type}-${item.id || index}`}
                className={cn(
                  "rounded-md border p-3",
                  isFocused
                    ? "border-slate-950 bg-slate-50"
                    : "border-slate-200 bg-white",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span
                    className={cn(
                      "rounded border px-2 py-0.5 text-[11px] font-semibold capitalize",
                      item.severity === "blocking"
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : "border-amber-200 bg-amber-50 text-amber-700",
                    )}
                  >
                    {item.severity}
                  </span>
                  <span className="text-[11px] uppercase tracking-wide text-slate-400">
                    {item.source.replaceAll("_", " ")}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium leading-snug text-slate-800">
                  {item.label}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={!item.focus}
                    onClick={() => {
                      if (!item.focus) return;
                      setActiveLens(item.focus.lens);
                      setSelectedEntity({
                        type: item.focus.entity_type,
                        id: item.focus.entity_id,
                      });
                    }}
                    className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Focus
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(routeForSource(item.source))}
                    className="rounded-md bg-slate-950 px-2 py-1 text-xs font-medium text-white"
                  >
                    Fix
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

function LeftPanel() {
  return (
    <aside className="flex min-h-0 flex-col gap-3 overflow-hidden border-r border-slate-200 bg-slate-50 p-3">
      <DesignTree />
      <ReviewQueue />
    </aside>
  );
}

function InterfacesLens() {
  const { definition, setSelectedEntity } = useWorkspace();
  if (!definition) return null;
  const interfaces = definition.interfaces || [];
  return (
    <div className="min-h-full bg-slate-50 p-5">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <header>
          <h1 className="text-2xl font-semibold text-slate-950">
            Interface Contracts
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Review subsystem-to-subsystem contracts, evidence, linked
            requirements, and stale state.
          </p>
        </header>
        <section className="grid gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Interfaces
            </div>
            <div className="mt-1 text-2xl font-semibold text-slate-950">
              {interfaces.length}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Suggested
            </div>
            <div className="mt-1 text-2xl font-semibold text-amber-700">
              {interfaces.filter((item) => item.status === "suggested").length}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Confirmed
            </div>
            <div className="mt-1 text-2xl font-semibold text-emerald-700">
              {interfaces.filter((item) => item.status === "confirmed").length}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Stale
            </div>
            <div className="mt-1 text-2xl font-semibold text-orange-700">
              {interfaces.filter((item) => item.is_stale).length}
            </div>
          </div>
        </section>
        {interfaces.length === 0 ? (
          <section className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
            <GitBranch className="mx-auto h-10 w-10 text-slate-400" />
            <h2 className="mt-3 text-lg font-semibold text-slate-950">
              No interface contracts yet
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Interfaces are generated from cross-subsystem architecture
              connections.
            </p>
          </section>
        ) : (
          <section className="grid gap-3 xl:grid-cols-2">
            {interfaces.map((item) => {
              const label =
                item.name ||
                item.label ||
                item.net_id ||
                item.connection_id ||
                item.id ||
                "Interface";
              const linkedCount =
                item.linked_subsystem_requirements_count ||
                item.linked_requirements_count ||
                item.linked_subsystem_requirements?.length ||
                item.linked_requirements?.length ||
                0;
              return (
                <article
                  key={
                    item.id ||
                    `${item.source_subsystem_id}-${item.target_subsystem_id}-${label}`
                  }
                  className={cn(
                    "rounded-lg border bg-white p-4 shadow-sm",
                    item.is_stale ? "border-orange-200" : "border-slate-200",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-base font-semibold text-slate-950">
                          {label}
                        </span>
                        <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                          {item.interface_type || item.signal_type || "unknown"}
                        </span>
                        <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                          {item.direction || "unknown"}
                        </span>
                        {item.status && (
                          <span
                            className={cn(
                              "rounded border px-2 py-0.5 text-xs font-medium",
                              item.status === "confirmed"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : item.status === "rejected"
                                  ? "border-slate-200 bg-slate-100 text-slate-500"
                                  : "border-amber-200 bg-amber-50 text-amber-700",
                            )}
                          >
                            {item.status}
                          </span>
                        )}
                        {item.is_stale && (
                          <span className="rounded border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">
                            stale
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        {item.source_subsystem_name ||
                          item.source_subsystem_id ||
                          "Source subsystem"}
                        {" -> "}
                        {item.target_subsystem_name ||
                          item.target_subsystem_id ||
                          "Target subsystem"}
                      </p>
                      {item.description && (
                        <p className="mt-2 line-clamp-2 text-sm text-slate-700">
                          {item.description}
                        </p>
                      )}
                    </div>
                    {item.id && (
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedEntity({
                            type: "interface",
                            id: String(item.id),
                          })
                        }
                        className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Focus
                      </button>
                    )}
                  </div>
                  <div className="mt-4 grid gap-2 text-sm md:grid-cols-3">
                    <div className="rounded-md bg-slate-50 p-2">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">
                        Evidence
                      </div>
                      <div className="font-semibold text-slate-950">
                        {item.evidence_count || item.evidence?.length || 0}
                      </div>
                    </div>
                    <div className="rounded-md bg-slate-50 p-2">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">
                        Requirements
                      </div>
                      <div className="font-semibold text-slate-950">
                        {linkedCount}
                      </div>
                    </div>
                    <div className="rounded-md bg-slate-50 p-2">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">
                        Verification
                      </div>
                      <div className="truncate font-semibold text-slate-950">
                        {item.verification_method || "not set"}
                      </div>
                    </div>
                  </div>
                  {Object.keys(item.constraints_json || {}).length > 0 && (
                    <div className="mt-3 rounded-md border border-slate-100 bg-slate-50 p-2 text-xs text-slate-600">
                      {Object.entries(item.constraints_json || {})
                        .slice(0, 4)
                        .map(([key, value]) => (
                          <span key={key} className="mr-3 inline-block">
                            <span className="font-semibold">{key}</span>:{" "}
                            {String(value)}
                          </span>
                        ))}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}

function CenterPanel() {
  const { activeLens, error, isLoading } = useWorkspace();
  if (isLoading) {
    return (
      <main className="flex items-center justify-center bg-slate-100 p-4">
        <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Loading design definition...
        </div>
      </main>
    );
  }
  if (error) {
    return (
      <main className="flex items-center justify-center bg-slate-100 p-4">
        <div className="max-w-lg rounded-lg border border-rose-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 font-semibold text-rose-700">
            <AlertTriangle className="h-4 w-4" />
            Failed to load definition
          </div>
          <p className="mt-2 text-sm text-slate-600">{error}</p>
        </div>
      </main>
    );
  }
  const isCanvasLens = activeLens === "architecture";
  return (
    <main
      className={cn(
        "min-h-0 bg-white",
        isCanvasLens
          ? "overflow-hidden [&>*]:h-full"
          : "overflow-y-auto overflow-x-hidden overscroll-contain",
      )}
    >
      {activeLens === "architecture" && <ArchitecturePage readOnly />}
      {activeLens === "requirements" && <RequirementsPage />}
      {activeLens === "subsystems" && <SubsystemsPage />}
      {activeLens === "interfaces" && <InterfacesLens />}
      {activeLens === "review" && <ReviewPage />}
    </main>
  );
}

function DefinitionWorkspace() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-100">
      <Header />
      <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)]">
        <LeftPanel />
        <CenterPanel />
      </div>
    </div>
  );
}

export function DesignDefinitionPage() {
  return (
    <WorkspaceProvider>
      <DefinitionWorkspace />
    </WorkspaceProvider>
  );
}
