import { useMemo, useState } from 'react';
import { SystemArchitectureView } from './components/SystemArchitectureView';
import { architectureRoutingFixtures } from './fixtures/routingFixtures';

export function ArchitectureFixturePage() {
  const [fixtureName, setFixtureName] = useState(architectureRoutingFixtures[0]?.name ?? '');
  const fixture = useMemo(
    () => architectureRoutingFixtures.find((item) => item.name === fixtureName) ?? architectureRoutingFixtures[0],
    [fixtureName],
  );

  if (!fixture) {
    return (
      <div className="flex h-full items-center justify-center text-sm font-medium text-slate-500">
        No architecture routing fixtures available.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <div className="text-sm font-bold text-slate-950">Architecture Routing Fixture</div>
          <div className="mt-0.5 text-xs text-slate-500">{fixture.purpose}</div>
        </div>
        <select
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
          value={fixture.name}
          onChange={(event) => setFixtureName(event.target.value)}
        >
          {architectureRoutingFixtures.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
      <div className="min-h-0 flex-1">
        <SystemArchitectureView
          components={fixture.blocks}
          initialConnections={fixture.connections}
          classificationMap={Object.fromEntries(fixture.blocks.map((block) => [block.id, 'non-auxiliary']))}
          layoutScopeId={`fixture:${fixture.name}`}
          onArchitectureComplete={() => undefined}
        />
      </div>
    </div>
  );
}
