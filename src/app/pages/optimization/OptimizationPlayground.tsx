import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Zap, 
  Target, 
  Search, 
  CheckCircle, 
  FileText, 
  RefreshCw,
  Play,
  Clock,
  Send,
  ChevronRight,
  Settings
} from 'lucide-react';
import { Button } from '@/app/shared/components/ui/button';
import { Input } from '@/app/shared/components/ui/input';
import { Badge } from '@/app/shared/components/ui/badge';
import { useSession } from '@/app/context/SessionContext';
import { useQueryParams } from '@/app/shared/hooks/useQueryParams';

// Tool types
type ToolType = 'recommendation' | 'focus' | 'explore' | 'select' | 'specs' | 'apply' | 'versions' | null;
type ToolStatus = 'not_started' | 'ready' | 'running' | 'completed' | 'error';

interface ToolNode {
  id: ToolType;
  name: string;
  icon: any;
  status: ToolStatus;
  description: string;
}

interface SharedState {
  recommendations: any[];
  selectedComponent: string | null;
  exploredAlternatives: any[];
  selectedAlternative: any | null;
  suggestedSpecs: any | null;
  appliedReplacements: any[];
  versionHistory: any[];
  currentBOMVersion: number;
}

// Mock data
const MOCK_RECOMMENDATIONS = [
  {
    id: '1',
    component_id: 'U1',
    current_part: 'LM2596S-5.0',
    reason: 'Low efficiency (75% vs required 85%)',
    priority: 'high',
    fails_requirements: ['REQ_POWER_EFFICIENCY', 'REQ_TEMP_RANGE'],
    alternatives_count: 3
  },
  {
    id: '2',
    component_id: 'C1',
    current_part: '100uF/25V',
    reason: 'Voltage rating may be insufficient',
    priority: 'medium',
    fails_requirements: [],
    alternatives_count: 2
  },
  {
    id: '3',
    component_id: 'U2',
    current_part: 'LM7805',
    reason: 'High power dissipation',
    priority: 'high',
    fails_requirements: ['REQ_THERMAL'],
    alternatives_count: 5
  }
];

const MOCK_ALTERNATIVES = [
  {
    id: '1',
    name: 'TPS54302',
    part_number: 'TPS54302DDAR',
    manufacturer: 'Texas Instruments',
    category: 'DC-DC Converter',
    topology: 'synchronous_buck',
    verified: true,
    confidence: 0.95,
    datasheet_url: 'https://www.ti.com/lit/ds/symlink/tps54302.pdf',
    KeySpecs: '5V, 3A, 95% efficiency',
    pros: ['Higher efficiency', 'Smaller footprint', 'Better thermal performance'],
    cons: ['More expensive'],
    specs: {
      output_voltage: '5V',
      output_current: '3A',
      efficiency: '95%',
      input_voltage_min: '4.5V',
      input_voltage_max: '28V',
      temperature_range: '-40°C to +125°C'
    }
  },
  {
    id: '2',
    name: 'LM2596S-ADJ',
    part_number: 'LM2596S-ADJ/NOPB',
    manufacturer: 'Texas Instruments',
    category: 'DC-DC Converter',
    topology: 'synchronous_buck',
    verified: true,
    confidence: 0.85,
    datasheet_url: 'https://www.ti.com/lit/ds/symlink/lm2596.pdf',
    KeySpecs: 'Adjustable, 3A, 80% efficiency',
    pros: ['Adjustable output', 'Lower cost'],
    cons: ['Lower efficiency', 'Same temperature range'],
    specs: {
      output_voltage: 'Adjustable',
      output_current: '3A',
      efficiency: '80%',
      input_voltage_min: '4.5V',
      input_voltage_max: '40V',
      temperature_range: '-40°C to +85°C'
    }
  },
  {
    id: '3',
    name: 'TPS54360',
    part_number: 'TPS54360DDAR',
    manufacturer: 'Texas Instruments',
    category: 'DC-DC Converter',
    topology: 'synchronous_buck',
    verified: true,
    confidence: 0.92,
    datasheet_url: 'https://www.ti.com/lit/ds/symlink/tps54360.pdf',
    KeySpecs: '5V, 3.5A, 96% efficiency',
    pros: ['Highest efficiency', 'Higher current rating'],
    cons: ['Most expensive', 'Larger package'],
    specs: {
      output_voltage: '5V',
      output_current: '3.5A',
      efficiency: '96%',
      input_voltage_min: '4.5V',
      input_voltage_max: '60V',
      temperature_range: '-40°C to +125°C'
    }
  }
];

const MOCK_SPECS = {
  output_voltage: { value: 5, unit: 'V', tolerance_type: 'exact' },
  output_current: { value: 3, unit: 'A', tolerance_type: 'minimum' },
  efficiency: { value: 90, unit: '%', tolerance_type: 'minimum' },
  input_voltage_min: { value: 4.5, unit: 'V', tolerance_type: 'exact' },
  input_voltage_max: { value: 28, unit: 'V', tolerance_type: 'exact' },
  temperature_range: { value: '-40 to +125', unit: '°C', tolerance_type: 'range' },
  package_type: { value: 'SOIC-8', unit: '', tolerance_type: 'exact' }
};

const MOCK_VERSIONS = [
  { version: 1, timestamp: new Date('2024-01-15'), changes: 'Initial BOM', components: 25 },
  { version: 2, timestamp: new Date('2024-01-20'), changes: 'Replaced U1 with TPS54302', components: 25 },
  { version: 3, timestamp: new Date('2024-01-25'), changes: 'Updated C1 and C2 capacitors', components: 25 }
];

export function OptimizationPlayground() {
  const [searchParams] = useSearchParams();
  const { sessionId: contextSessionId, setSessionId } = useSession();
  const { sessionId: querySessionId } = useQueryParams();
  const subsystemId = searchParams.get('subsystem');
  const sessionIdParam = searchParams.get('session');

  const [activeTool, setActiveTool] = useState<ToolType>(null);

  // Shared state with initial mock data
  const [sharedState, setSharedState] = useState<SharedState>({
    recommendations: MOCK_RECOMMENDATIONS,
    selectedComponent: 'U1',
    exploredAlternatives: MOCK_ALTERNATIVES,
    selectedAlternative: MOCK_ALTERNATIVES[0],
    suggestedSpecs: MOCK_SPECS,
    appliedReplacements: [{ version: 2, component: 'U1', replacement: 'TPS54302' }],
    versionHistory: MOCK_VERSIONS,
    currentBOMVersion: 3,
  });

  // Tool nodes configuration
  const toolNodes: ToolNode[] = [
    {
      id: 'recommendation',
      name: 'Recommendation',
      icon: Zap,
      status: sharedState.recommendations.length > 0 ? 'completed' : 'ready',
      description: 'Get component recommendations'
    },
    {
      id: 'focus',
      name: 'Focus Component',
      icon: Target,
      status: sharedState.selectedComponent ? 'completed' : 'ready',
      description: 'Select component to optimize'
    },
    {
      id: 'explore',
      name: 'Part Explorer',
      icon: Search,
      status: sharedState.exploredAlternatives.length > 0 ? 'completed' : 
              sharedState.selectedComponent ? 'ready' : 'not_started',
      description: 'Explore alternative parts'
    },
    {
      id: 'select',
      name: 'Select Alternative',
      icon: CheckCircle,
      status: sharedState.selectedAlternative ? 'completed' : 
              sharedState.exploredAlternatives.length > 0 ? 'ready' : 'not_started',
      description: 'Choose alternative part'
    },
    {
      id: 'specs',
      name: 'Suggest Specs',
      icon: FileText,
      status: sharedState.suggestedSpecs ? 'completed' : 
              sharedState.selectedAlternative ? 'ready' : 'not_started',
      description: 'Generate specifications'
    },
    {
      id: 'apply',
      name: 'Apply Replacement',
      icon: RefreshCw,
      status: sharedState.appliedReplacements.length > 0 ? 'completed' : 
              sharedState.selectedAlternative ? 'ready' : 'not_started',
      description: 'Apply changes to BOM'
    },
    {
      id: 'versions',
      name: 'Versions',
      icon: Clock,
      status: sharedState.versionHistory.length > 0 ? 'completed' : 'ready',
      description: 'View version history'
    },
  ];

  // Sync session ID
  useEffect(() => {
    const activeSessionId = querySessionId || sessionIdParam || contextSessionId;
    if (activeSessionId && activeSessionId !== contextSessionId) {
      setSessionId(activeSessionId);
    }
  }, [contextSessionId, querySessionId, sessionIdParam, setSessionId]);

  const getStatusIcon = (status: ToolStatus) => {
    switch (status) {
      case 'completed':
        return <div className="w-3 h-3 rounded-full bg-green-500" />;
      case 'running':
        return <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />;
      case 'ready':
        return <div className="w-3 h-3 rounded-full bg-yellow-500" />;
      case 'error':
        return <div className="w-3 h-3 rounded-full bg-red-500" />;
      default:
        return <div className="w-3 h-3 rounded-full bg-gray-300" />;
    }
  };

  const activeSessionId = querySessionId || sessionIdParam || contextSessionId;

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Top Bar */}
      <div className="border-b bg-white/80 backdrop-blur-sm px-8 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 p-3 shadow-lg">
              <Settings className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Optimization Playground</h1>
              <p className="text-sm text-gray-600">
                Session: <code className="bg-gray-100 px-2 py-0.5 rounded text-xs">{activeSessionId || 'Not set'}</code>
                {subsystemId && (
                  <> • Subsystem: <code className="bg-gray-100 px-2 py-0.5 rounded text-xs">{subsystemId}</code></>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Flow Map - Left Panel */}
        <div className="w-64 border-r border-gray-200 bg-white/50 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">Flow Map</h2>
            <div className="space-y-2">
              {toolNodes.map((node, index) => {
                const Icon = node.icon;
                const isActive = activeTool === node.id;
                return (
                  <div key={node.id || 'null'}>
                    <button
                      onClick={() => setActiveTool(node.id)}
                      className={`w-full text-left p-3 rounded-xl transition-all ${
                        isActive
                          ? 'bg-cyan-50 border-2 border-cyan-400 shadow-md'
                          : 'bg-white border-2 border-gray-200 hover:border-cyan-200 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {getStatusIcon(node.status)}
                        <Icon className={`h-4 w-4 ${isActive ? 'text-cyan-600' : 'text-gray-600'}`} />
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-medium truncate ${isActive ? 'text-cyan-700' : 'text-gray-900'}`}>
                            {node.name}
                          </div>
                          <div className="text-xs text-gray-500 truncate">{node.description}</div>
                        </div>
                      </div>
                    </button>
                    {index < toolNodes.length - 1 && (
                      <div className="flex justify-center py-1">
                        <ChevronRight className="h-4 w-4 text-gray-300 rotate-90" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main Workspace - Center */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeTool ? (
            <ToolView
              tool={activeTool}
              sharedState={sharedState}
              setSharedState={setSharedState}
              sessionId={activeSessionId || ''}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <div className="rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 p-6 mb-6 mx-auto w-24 h-24 flex items-center justify-center">
                  <Settings className="h-12 w-12 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome to the Playground</h2>
                <p className="text-gray-600 mb-6">
                  Select a tool from the Flow Map to get started. Each tool has its own chat interface for interaction.
                </p>
                <div className="bg-white rounded-xl border-2 border-cyan-200 p-4 text-left shadow-sm">
                  <p className="text-sm font-semibold text-gray-700 mb-2">Available Tools:</p>
                  <ul className="text-xs text-gray-600 space-y-1">
                    <li>• Recommendation - Get component suggestions</li>
                    <li>• Focus Component - Select component to optimize</li>
                    <li>• Part Explorer - Find alternative parts</li>
                    <li>• Select Alternative - Choose replacement</li>
                    <li>• Suggest Specs - Generate specifications</li>
                    <li>• Apply Replacement - Update BOM</li>
                    <li>• Versions - View version history</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Tool View Component
interface ToolViewProps {
  tool: ToolType;
  sharedState: SharedState;
  setSharedState: (state: SharedState | ((prev: SharedState) => SharedState)) => void;
  sessionId: string;
}

function ToolView({ tool, sharedState, setSharedState }: ToolViewProps) {
  if (!tool) return null;
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleChat = async (message: string) => {
    if (!message.trim()) return;
    
    setChatMessages(prev => [...prev, { role: 'user', content: message, timestamp: new Date() }]);
    setIsLoading(true);
    setChatInput('');

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 500));

      const responses: Record<string, string[]> = {
        recommendation: [
          'I found 3 components that need optimization. U1 has low efficiency, C1 may have voltage issues, and U2 has thermal concerns.',
          'Based on the BOM analysis, I recommend focusing on U1 first due to efficiency requirements.',
          'Here are the top recommendations: U1 (efficiency), U2 (thermal), and C1 (voltage rating).'
        ],
        focus: [
          `Component ${sharedState.selectedComponent || 'U1'} is now selected. You can explore alternatives for this component.`,
          `Focus set on ${sharedState.selectedComponent || 'U1'}. Ready to explore replacement options.`,
          `Working with component ${sharedState.selectedComponent || 'U1'}. What would you like to do next?`
        ],
        explore: [
          'I found 3 alternative parts: TPS54302 (best efficiency), LM2596S-ADJ (adjustable), and TPS54360 (highest performance).',
          'Here are the alternatives I discovered. TPS54302 looks like the best match for your requirements.',
          'Found several alternatives. TPS54302 has 95% efficiency and meets all your requirements.'
        ],
        select: [
          `Selected ${sharedState.selectedAlternative?.name || 'TPS54302'}. Ready to generate specs or apply replacement.`,
          `Alternative ${sharedState.selectedAlternative?.name || 'TPS54302'} is now selected.`,
          `Great choice! ${sharedState.selectedAlternative?.name || 'TPS54302'} is a solid replacement option.`
        ],
        specs: [
          'I\'ve generated optimized specifications: 5V output, 3A minimum current, 90%+ efficiency, -40°C to +125°C temperature range.',
          'Here are the suggested specs based on your requirements and the selected alternative.',
          'Specifications generated. All parameters meet your design requirements.'
        ],
        apply: [
          'Replacement applied successfully! New BOM version created. You can view it in the Versions tool.',
          'Applied the replacement. The BOM has been updated to version ' + (sharedState.currentBOMVersion + 1) + '.',
          'Done! The replacement has been applied and a new version has been created.'
        ],
        versions: [
          'You have 3 versions: v1 (initial), v2 (U1 replaced), v3 (capacitors updated).',
          'Version history shows 3 iterations. Version 3 is the current active version.',
          'Here\'s your version history. Each version tracks the changes made to the BOM.'
        ]
      };

      const toolResponses = responses[tool] || ['I understand. Let me help you with that.'];
      const response = toolResponses[Math.floor(Math.random() * toolResponses.length)];

      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: response,
        timestamp: new Date()
      }]);
    } catch (error) {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${error}`,
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const toolConfig = {
    recommendation: {
      title: 'Recommendation',
      description: 'Get AI-powered recommendations for component optimization',
      icon: Zap,
      structuredActions: (
        <div className="space-y-3">
          <Button
            onClick={async () => {
              await handleChat('Get recommendations for components with low efficiency');
            }}
            className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
          >
            <Play className="h-4 w-4 mr-2" />
            Get Recommendations
          </Button>
          {sharedState.recommendations.length > 0 && (
            <div className="bg-white rounded-xl border-2 border-cyan-200 p-4 space-y-3">
              <div className="text-sm font-semibold text-gray-900">Recommendations:</div>
              {sharedState.recommendations.map((rec) => (
                <div key={rec.id} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900">{rec.component_id}</span>
                    <Badge className={rec.priority === 'high' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}>
                      {rec.priority}
                    </Badge>
                  </div>
                  <div className="text-xs text-gray-600 mb-1">{rec.current_part}</div>
                  <div className="text-xs text-gray-700">{rec.reason}</div>
                  {rec.fails_requirements.length > 0 && (
                    <div className="mt-2 text-xs text-red-600">
                      Fails: {rec.fails_requirements.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )
    },
    focus: {
      title: 'Focus Component',
      description: 'Select a component to optimize',
      icon: Target,
      structuredActions: (
        <div className="space-y-3">
          <div className="bg-white rounded-xl border-2 border-cyan-200 p-4">
            <label className="text-sm font-semibold text-gray-900 mb-2 block">Component ID</label>
            <Input
              placeholder="e.g., U1"
              value={sharedState.selectedComponent || ''}
              onChange={(e) => setSharedState(prev => ({ ...prev, selectedComponent: e.target.value }))}
              className="mb-3"
            />
            <Button
              onClick={async () => {
                if (sharedState.selectedComponent) {
                  await handleChat(`Focus on component ${sharedState.selectedComponent}`);
                }
              }}
              className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
            >
              Set Focus
            </Button>
          </div>
          {sharedState.selectedComponent && (
            <div className="bg-green-50 rounded-lg p-3 border border-green-200">
              <div className="text-xs text-green-700">
                ✓ Focused on: <strong>{sharedState.selectedComponent}</strong>
              </div>
            </div>
          )}
        </div>
      )
    },
    explore: {
      title: 'Part Explorer',
      description: 'Explore alternative parts for the selected component',
      icon: Search,
      structuredActions: (
        <div className="space-y-3">
          <Button
            onClick={async () => {
              await handleChat('Explore alternatives with higher efficiency');
            }}
            className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
            disabled={!sharedState.selectedComponent}
          >
            <Search className="h-4 w-4 mr-2" />
            Explore Alternatives
          </Button>
          {sharedState.exploredAlternatives.length > 0 && (
            <div className="bg-white rounded-xl border-2 border-cyan-200 p-4 space-y-3">
              <div className="text-sm font-semibold text-gray-900">Alternatives Found:</div>
              {sharedState.exploredAlternatives.map((alt) => (
                <div key={alt.id} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900">{alt.name}</span>
                    {alt.verified && (
                      <Badge className="bg-green-100 text-green-700">Verified</Badge>
                    )}
                  </div>
                  <div className="text-xs text-gray-600 mb-1">{alt.part_number}</div>
                  <div className="text-xs text-gray-700 mb-1">{alt.KeySpecs}</div>
                  <div className="text-xs text-cyan-600">{alt.manufacturer}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )
    },
    select: {
      title: 'Select Alternative',
      description: 'Choose an alternative part from explored options',
      icon: CheckCircle,
      structuredActions: (
        <div className="space-y-2">
          {sharedState.exploredAlternatives.length > 0 ? (
            sharedState.exploredAlternatives.map((alt) => (
              <Button
                key={alt.id}
                onClick={async () => {
                  setSharedState(prev => ({ ...prev, selectedAlternative: alt }));
                  await handleChat(`Select alternative ${alt.name}`);
                }}
                variant={sharedState.selectedAlternative?.id === alt.id ? 'default' : 'outline'}
                className={`w-full ${
                  sharedState.selectedAlternative?.id === alt.id
                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700'
                    : ''
                }`}
              >
                <div className="text-left w-full">
                  <div className="font-medium">{alt.name}</div>
                  <div className="text-xs opacity-80">{alt.part_number}</div>
                </div>
              </Button>
            ))
          ) : (
            <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200 text-center">
              <div className="text-sm text-yellow-700">
                No alternatives available. Run Part Explorer first.
              </div>
            </div>
          )}
        </div>
      )
    },
    specs: {
      title: 'Suggest Specs',
      description: 'Generate specifications for the selected alternative',
      icon: FileText,
      structuredActions: (
        <div className="space-y-3">
          <Button
            onClick={async () => {
              await handleChat('Suggest optimized specifications');
            }}
            className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
            disabled={!sharedState.selectedAlternative}
          >
            <FileText className="h-4 w-4 mr-2" />
            Generate Specs
          </Button>
          {sharedState.suggestedSpecs && (
            <div className="bg-white rounded-xl border-2 border-cyan-200 p-4">
              <div className="text-sm font-semibold text-gray-900 mb-3">Suggested Specs:</div>
              <div className="space-y-2">
                {Object.entries(sharedState.suggestedSpecs).map(([key, spec]: [string, any]) => (
                  <div key={key} className="flex justify-between items-center text-xs bg-gray-50 p-2 rounded">
                    <span className="text-gray-600 capitalize">{key.replace(/_/g, ' ')}:</span>
                    <span className="text-gray-900 font-medium">
                      {spec.value} {spec.unit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )
    },
    apply: {
      title: 'Apply Replacement',
      description: 'Apply the selected alternative to the BOM',
      icon: RefreshCw,
      structuredActions: (
        <div className="space-y-3">
          <Button
            onClick={async () => {
              const newVersion = sharedState.currentBOMVersion + 1;
              setSharedState(prev => ({
                ...prev,
                appliedReplacements: [...prev.appliedReplacements, { 
                  version: newVersion, 
                  component: prev.selectedComponent,
                  replacement: prev.selectedAlternative?.name 
                }],
                currentBOMVersion: newVersion,
                versionHistory: [...prev.versionHistory, {
                  version: newVersion,
                  timestamp: new Date(),
                  changes: `Replaced ${prev.selectedComponent} with ${prev.selectedAlternative?.name}`,
                  components: 25
                }]
              }));
              await handleChat('Apply the replacement');
            }}
            className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700"
            disabled={!sharedState.selectedAlternative}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Apply Replacement
          </Button>
          {sharedState.appliedReplacements.length > 0 && (
            <div className="bg-white rounded-xl border-2 border-cyan-200 p-4">
              <div className="text-sm font-semibold text-gray-900 mb-2">Applied Replacements:</div>
              {sharedState.appliedReplacements.map((rep, idx) => (
                <div key={idx} className="text-xs text-gray-700 bg-gray-50 p-2 rounded mb-1">
                  Version {rep.version}: {rep.component} → {rep.replacement}
                </div>
              ))}
            </div>
          )}
        </div>
      )
    },
    versions: {
      title: 'Versions',
      description: 'View and manage BOM version history',
      icon: Clock,
      structuredActions: (
        <div className="space-y-2">
          <div className="bg-white rounded-xl border-2 border-cyan-200 p-4">
            <div className="text-sm font-semibold text-gray-900 mb-3">
              Current Version: <span className="text-cyan-600">v{sharedState.currentBOMVersion}</span>
            </div>
            {sharedState.versionHistory.length > 0 ? (
              <div className="space-y-2">
                {sharedState.versionHistory.map((v) => (
                  <div key={v.version} className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-900">Version {v.version}</span>
                      <Badge className="bg-blue-100 text-blue-700">
                        {v.components} components
                      </Badge>
                    </div>
                    <div className="text-xs text-gray-600 mb-1">{v.changes}</div>
                    <div className="text-xs text-gray-500">
                      {v.timestamp.toLocaleDateString()} {v.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-400 text-center py-4">No version history yet</div>
            )}
          </div>
        </div>
      )
    }
  };

  const config = tool ? toolConfig[tool] : null;
  if (!config) return null;

  const Icon = config.icon;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Tool Header */}
      <div className="border-b border-gray-200 bg-white/80 backdrop-blur-sm p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 p-2">
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">{config.title}</h2>
            <p className="text-sm text-gray-600">{config.description}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Structured Actions - Left */}
        <div className="w-80 border-r border-gray-200 bg-white/50 p-4 overflow-y-auto">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Actions</h3>
          {config.structuredActions}
        </div>

        {/* Chat Interface - Right */}
        <div className="flex-1 flex flex-col bg-white/30">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 ? (
              <div className="text-center text-gray-500 text-sm py-8">
                Start a conversation to interact with this tool...
              </div>
            ) : (
              chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-xl p-3 ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
                        : 'bg-white border-2 border-cyan-200 text-gray-900'
                    }`}
                  >
                    <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                    <div className={`text-xs mt-1 ${msg.role === 'user' ? 'text-blue-100' : 'text-gray-500'}`}>
                      {msg.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border-2 border-cyan-200 rounded-xl p-3">
                  <div className="flex items-center gap-2 text-gray-600">
                    <div className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
                    Thinking...
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 bg-white/80 backdrop-blur-sm p-4">
            <div className="flex gap-2">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleChat(chatInput);
                  }
                }}
                placeholder="Ask questions, give instructions..."
                className="bg-white border-cyan-200 focus:border-cyan-400"
                disabled={isLoading}
              />
              <Button
                onClick={() => handleChat(chatInput)}
                className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                disabled={isLoading || !chatInput.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
