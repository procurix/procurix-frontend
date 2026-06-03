import { useState } from 'react';
import { Plus, Edit2, Trash2, X, Save, Link2, Package, Layers, ChevronDown } from 'lucide-react';
import { Button } from '@/app/shared/components/ui/button';
import { Input } from '@/app/shared/components/ui/input';
import { Textarea } from '@/app/shared/components/ui/textarea';
import type { Component } from '@/app/types';
import type { ArchitectureConnectionData as ConnectionData } from '../utils/connectionMapping';

interface ComponentBlock extends Component {
  x: number;
  y: number;
  connections: string[];
  category?: string;
  quantity?: number;
  pinout?: Record<string, { name: string; type: string; description: string }>;
}

interface ArchitectureBuilderSidebarProps {
  blocks: ComponentBlock[];
  connections: ConnectionData[];
  onAddComponent: (component: Omit<ComponentBlock, 'x' | 'y' | 'connections'>) => void;
  onUpdateComponent: (id: string, component: Partial<ComponentBlock>) => void;
  onDeleteComponent: (id: string) => void;
  onAddConnection: (connection: Omit<ConnectionData, 'id'>) => void;
  onUpdateConnection: (id: string, connection: Partial<ConnectionData>) => void;
  onDeleteConnection: (id: string) => void;
  onClose?: () => void;
}

type TabType = 'components' | 'connections';

// Default pin type colors matching ComponentNode
const defaultPinTypeColors: Record<string, string> = {
  'INPUT': '#3b82f6',    // Blue
  'GROUND': '#6b7280',   // Gray
  'OUTPUT': '#10b981',   // Green
  'POWER': '#f59e0b',    // Orange/Amber
  'ANALOG': '#8b5cf6',   // Purple
  'DIGITAL': '#ec4899',  // Pink
};

// Default connection type colors matching SystemArchitectureView
const defaultConnectionTypeColors: Record<string, string> = {
  'power': '#ef4444', // red
  'switching': '#f59e0b', // amber/orange
  'power_and_feedback': '#8b5cf6', // purple
  'signal': '#3b82f6', // blue
  'data': '#8b5cf6', // purple
  'analog': '#f59e0b', // amber
  'differential': '#ec4899', // pink
  'clock': '#10b981', // green
  'ground': '#6b7280', // gray
  'feedback': '#9333ea', // purple
  'control': '#06b6d4', // cyan
};

// Available colors for custom pin types (distinct colors that don't repeat)
const customPinTypeColorPalette = [
  '#ef4444', // Red
  '#06b6d4', // Cyan
  '#84cc16', // Lime
  '#f97316', // Orange
  '#a855f7', // Violet
  '#14b8a6', // Teal
  '#eab308', // Yellow
  '#f43f5e', // Rose
  '#6366f1', // Indigo
  '#22d3ee', // Sky
  '#34d399', // Emerald
  '#fb7185', // Pink
  '#60a5fa', // Light Blue
  '#a78bfa', // Light Purple
  '#fbbf24', // Amber
];

// Available colors for custom connection types (distinct colors that don't repeat)
const customConnectionTypeColorPalette = [
  '#ef4444', // Red
  '#06b6d4', // Cyan
  '#84cc16', // Lime
  '#f97316', // Orange
  '#a855f7', // Violet
  '#14b8a6', // Teal
  '#eab308', // Yellow
  '#f43f5e', // Rose
  '#6366f1', // Indigo
  '#22d3ee', // Sky
  '#34d399', // Emerald
  '#fb7185', // Pink
  '#60a5fa', // Light Blue
  '#a78bfa', // Light Purple
  '#fbbf24', // Amber
];

// Get pin type color - uses stored colors for custom types
const getPinTypeColor = (pinType: string, customPinTypeColors?: Record<string, string>): string => {
  const type = (pinType || '').toUpperCase();
  
  // Check default colors first
  if (defaultPinTypeColors[type]) {
    return defaultPinTypeColors[type];
  }
  
  // Check custom colors if provided
  if (customPinTypeColors && customPinTypeColors[type]) {
    return customPinTypeColors[type];
  }
  
  // Default gray for unknown types
  return '#9ca3af';
};

// Get connection type color - uses stored colors for custom types
const getConnectionTypeColor = (connectionType: string, customConnectionTypeColors?: Record<string, string>): string => {
  const type = (connectionType || '').toLowerCase();
  
  // Check default colors first
  if (defaultConnectionTypeColors[type]) {
    return defaultConnectionTypeColors[type];
  }
  
  // Check custom colors if provided
  if (customConnectionTypeColors && customConnectionTypeColors[type]) {
    return customConnectionTypeColors[type];
  }
  
  // Default gray for unknown types
  return '#6b7280';
};

const defaultPinTypes = ['INPUT', 'OUTPUT', 'POWER', 'GROUND', 'ANALOG', 'DIGITAL'] as const;

const defaultConnectionTypes: ConnectionData['type'][] = [
  'power',
  'signal',
  'data',
  'analog',
  'differential',
  'clock',
  'ground',
  'switching',
  'power_and_feedback',
  'feedback',
  'control',
];

export function ArchitectureBuilderSidebar({
  blocks,
  connections,
  onAddComponent,
  onUpdateComponent,
  onDeleteComponent,
  onAddConnection,
  onUpdateConnection,
  onDeleteConnection,
  onClose,
}: ArchitectureBuilderSidebarProps) {
  const [activeTab, setActiveTab] = useState<TabType>('components');
  const [editingComponentId, setEditingComponentId] = useState<string | null>(null);
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(null);
  const [isAddingComponent, setIsAddingComponent] = useState(false);
  const [isAddingConnection, setIsAddingConnection] = useState(false);
  const [openPinTypeDropdowns, setOpenPinTypeDropdowns] = useState<Set<number>>(new Set());
  
  // Custom types state
  const [customPinTypes, setCustomPinTypes] = useState<string[]>(() => {
    // Load from localStorage if available
    const saved = localStorage.getItem('customPinTypes');
    return saved ? JSON.parse(saved) : [];
  });
  const [customPinTypeColors, setCustomPinTypeColors] = useState<Record<string, string>>(() => {
    // Load custom pin type colors from localStorage
    const saved = localStorage.getItem('customPinTypeColors');
    return saved ? JSON.parse(saved) : {};
  });
  const [customConnectionTypes, setCustomConnectionTypes] = useState<string[]>(() => {
    // Load from localStorage if available
    const saved = localStorage.getItem('customConnectionTypes');
    return saved ? JSON.parse(saved) : [];
  });
  const [customConnectionTypeColors, setCustomConnectionTypeColors] = useState<Record<string, string>>(() => {
    // Load custom connection type colors from localStorage
    const saved = localStorage.getItem('customConnectionTypeColors');
    return saved ? JSON.parse(saved) : {};
  });
  const [openConnectionTypeDropdown, setOpenConnectionTypeDropdown] = useState(false);
  
  // Combined types
  const pinTypes = [...defaultPinTypes, ...customPinTypes];
  const connectionTypes = [...defaultConnectionTypes, ...customConnectionTypes] as ConnectionData['type'][];
  
  // State for adding new types
  const [newPinType, setNewPinType] = useState('');
  const [newConnectionType, setNewConnectionType] = useState('');
  const [showAddPinType, setShowAddPinType] = useState(false);
  const [showAddConnectionType, setShowAddConnectionType] = useState(false);

  // Component form state
  const [componentForm, setComponentForm] = useState<Partial<ComponentBlock>>({
    id: '',
    reference: '',
    partNumber: '',
    manufacturer: '',
    type: '',
    description: '',
    category: '',
    specs: {},
    isIdentified: false,
    isGeneric: false,
    complianceStatus: 'unknown',
    pinout: {},
  });

  // Specs form state (key-value pairs)
  const [specsEntries, setSpecsEntries] = useState<Array<{ key: string; value: string }>>([]);
  
  // Pinout form state
  const [pinoutEntries, setPinoutEntries] = useState<Array<{ 
    name: string; 
    type: string; 
    description: string;
  }>>([]);

  // Connection form state
  const [connectionForm, setConnectionForm] = useState<Partial<ConnectionData>>({
    from: '',
    to: '',
    type: 'signal',
    label: '',
    signal_name: '',
    connection_type: '',
    pins: '',
    from_pin: '',
    to_pin: '',
  });
  const connectionPinsComplete = Boolean(connectionForm.from_pin?.trim() && connectionForm.to_pin?.trim());
  const canSubmitConnection = Boolean(
    connectionForm.from &&
    connectionForm.to &&
    connectionForm.type &&
    (editingConnectionId || connectionPinsComplete)
  );

  const handleComponentSubmit = () => {
    if (!componentForm.id || !componentForm.reference || !componentForm.type) {
      return;
    }

    // Convert specs entries to object
    const specs: Record<string, string | number> = {};
    specsEntries.forEach(({ key, value }) => {
      if (key.trim()) {
        // Try to parse as number if possible
        const numValue = parseFloat(value);
        specs[key.trim()] = isNaN(numValue) ? value.trim() : numValue;
      }
    });

    // Convert pinout entries to object - generate pin numbers dynamically
    const pinout: Record<string, { name: string; type: string; description: string }> = {};
    
    pinoutEntries.forEach(({ name, type, description }, index) => {
      // Generate pin number dynamically (1-based index)
      const pinNumber = String(index + 1);
      
      // Only require name to be non-empty (pin number is auto-generated)
      if (name && name.trim()) {
        pinout[pinNumber] = {
          name: name.trim(),
          type: (type && type.trim()) || 'INPUT',
          description: (description && description.trim()) || '',
        };
      }
    });

    // Always include pinout, even if empty - this ensures it's saved
    // IMPORTANT: Remove pinout from componentForm before spreading to avoid conflicts
    // Pinout is managed separately via pinoutEntries, not componentForm
    const componentFormWithoutPinout = { ...componentForm };
    delete componentFormWithoutPinout.pinout;
    
    // Build final component with required fields
    const finalComponent: Omit<ComponentBlock, 'x' | 'y' | 'connections'> = {
      id: componentForm.id!,
      reference: componentForm.reference!,
      type: componentForm.type!,
      description: componentForm.description || '',
      isIdentified: componentForm.isIdentified || false,
      isGeneric: componentForm.isGeneric || false,
      complianceStatus: componentForm.complianceStatus || 'unknown',
      ...componentFormWithoutPinout,
      // Override specs and pinout with the ones we built from form entries
      specs: Object.keys(specs).length > 0 ? specs : {},
      pinout: Object.keys(pinout).length > 0 ? pinout : {}, // Use the pinout built from pinoutEntries, always an object
    };
    
    // Ensure pinout is always an object (never undefined)
    finalComponent.pinout = finalComponent.pinout || {};

    if (editingComponentId) {
      onUpdateComponent(editingComponentId, finalComponent);
      setEditingComponentId(null);
    } else {
      onAddComponent(finalComponent);
      setIsAddingComponent(false);
    }

    // Reset form
    // Note: pinout is NOT stored in componentForm - it's managed separately via pinoutEntries
    setComponentForm({
      id: '',
      reference: '',
      partNumber: '',
      manufacturer: '',
      type: '',
      description: '',
      category: '',
      specs: {},
      isIdentified: false,
      isGeneric: false,
      complianceStatus: 'unknown',
      // Don't include pinout here - it's managed via pinoutEntries state
    });
    setSpecsEntries([]);
    setPinoutEntries([]);
  };

  const handleConnectionSubmit = () => {
    if (!canSubmitConnection) {
      return;
    }

    if (editingConnectionId) {
      onUpdateConnection(editingConnectionId, connectionForm);
      setEditingConnectionId(null);
    } else {
      onAddConnection({
        from: connectionForm.from!,
        to: connectionForm.to!,
        type: connectionForm.type!,
        label: connectionForm.label,
        signal_name: connectionForm.signal_name,
        connection_type: connectionForm.connection_type,
        pins: connectionForm.pins,
        from_pin: connectionForm.from_pin,
        to_pin: connectionForm.to_pin,
      });
      setIsAddingConnection(false);
    }

    // Close dropdowns
    setOpenConnectionTypeDropdown(false);
    setShowAddConnectionType(false);

    // Reset form
    setConnectionForm({
      from: '',
      to: '',
      type: 'signal',
      label: '',
      signal_name: '',
      connection_type: '',
      pins: '',
      from_pin: '',
      to_pin: '',
    });
  };

  const handleEditComponent = (component: ComponentBlock) => {
    setEditingComponentId(component.id);
    setComponentForm({
      id: component.id,
      reference: component.reference,
      partNumber: component.partNumber,
      manufacturer: component.manufacturer,
      type: component.type,
      description: component.description,
      category: component.category,
      specs: component.specs || {},
      isIdentified: component.isIdentified,
      isGeneric: component.isGeneric,
      complianceStatus: component.complianceStatus,
      complianceScore: component.complianceScore,
      pinout: component.pinout || {},
    });
    
    // Convert specs object to entries
    const specsArray = Object.entries(component.specs || {}).map(([key, value]) => ({
      key,
      value: String(value),
    }));
    setSpecsEntries(specsArray);
    
    // Convert pinout object to entries - pin numbers are auto-generated, so we just need name, type, description
    const pinoutObj = component.pinout || {};
    const pinoutArray = Object.entries(pinoutObj)
      .sort(([a], [b]) => {
        // Sort by pin number (convert to number for proper sorting)
        const numA = parseInt(a) || 0;
        const numB = parseInt(b) || 0;
        return numA - numB;
      })
      .map(([, pin]) => {
        // Pin number is ignored - it will be auto-generated from index when saving.
        return {
          name: pin.name || '',
          type: pin.type || 'INPUT',
          description: pin.description || '',
        };
      });
    setPinoutEntries(pinoutArray);
    
    setIsAddingComponent(true);
  };

  const handleEditConnection = (connection: ConnectionData) => {
    setEditingConnectionId(connection.id);
    setConnectionForm({
      from: connection.from,
      to: connection.to,
      type: connection.type,
      label: connection.label,
      signal_name: connection.signal_name,
      connection_type: connection.connection_type,
      pins: connection.pins,
      from_pin: connection.from_pin,
      to_pin: connection.to_pin,
    });
    setIsAddingConnection(true);
  };

  const handleCancel = () => {
    setEditingComponentId(null);
    setEditingConnectionId(null);
    setIsAddingComponent(false);
    setIsAddingConnection(false);
    setOpenConnectionTypeDropdown(false);
    setShowAddConnectionType(false);
    setComponentForm({
      id: '',
      reference: '',
      partNumber: '',
      manufacturer: '',
      type: '',
      description: '',
      category: '',
      specs: {},
      isIdentified: false,
      isGeneric: false,
      complianceStatus: 'unknown',
      pinout: {},
    });
    setSpecsEntries([]);
    setPinoutEntries([]);
    setConnectionForm({
      from: '',
      to: '',
      type: 'signal',
      label: '',
      signal_name: '',
      connection_type: '',
      pins: '',
      from_pin: '',
      to_pin: '',
    });
  };

  const handleAddPinType = () => {
    if (newPinType.trim() && !pinTypes.includes(newPinType.trim().toUpperCase())) {
      const newType = newPinType.trim().toUpperCase();
      const updated = [...customPinTypes, newType];
      setCustomPinTypes(updated);
      localStorage.setItem('customPinTypes', JSON.stringify(updated));
      
      // Assign a unique color to the new pin type
      const usedColors = new Set([
        ...Object.values(defaultPinTypeColors),
        ...Object.values(customPinTypeColors)
      ]);
      
      // Find first available color from palette
      let assignedColor = customPinTypeColorPalette.find(color => !usedColors.has(color));
      
      // If all colors are used, cycle through palette
      if (!assignedColor) {
        const colorIndex = customPinTypes.length % customPinTypeColorPalette.length;
        assignedColor = customPinTypeColorPalette[colorIndex];
      }
      
      const updatedColors = { ...customPinTypeColors, [newType]: assignedColor };
      setCustomPinTypeColors(updatedColors);
      localStorage.setItem('customPinTypeColors', JSON.stringify(updatedColors));
      
      setNewPinType('');
      setShowAddPinType(false);
    }
  };

  const handleRemovePinType = (typeToRemove: string) => {
    const updated = customPinTypes.filter(t => t !== typeToRemove);
    setCustomPinTypes(updated);
    localStorage.setItem('customPinTypes', JSON.stringify(updated));
    
    // Remove color assignment
    const updatedColors = { ...customPinTypeColors };
    delete updatedColors[typeToRemove];
    setCustomPinTypeColors(updatedColors);
    localStorage.setItem('customPinTypeColors', JSON.stringify(updatedColors));
  };

  const handleAddConnectionType = () => {
    if (newConnectionType.trim() && !connectionTypes.includes(newConnectionType.trim().toLowerCase() as ConnectionData['type'])) {
      const newType = newConnectionType.trim().toLowerCase();
      const updated = [...customConnectionTypes, newType];
      setCustomConnectionTypes(updated);
      localStorage.setItem('customConnectionTypes', JSON.stringify(updated));
      
      // Assign a unique color to the new connection type
      const usedColors = new Set([
        ...Object.values(defaultConnectionTypeColors),
        ...Object.values(customConnectionTypeColors)
      ]);
      
      // Find first available color from palette
      let assignedColor = customConnectionTypeColorPalette.find(color => !usedColors.has(color));
      
      // If all colors are used, cycle through palette
      if (!assignedColor) {
        const colorIndex = customConnectionTypes.length % customConnectionTypeColorPalette.length;
        assignedColor = customConnectionTypeColorPalette[colorIndex];
      }
      
      const updatedColors = { ...customConnectionTypeColors, [newType]: assignedColor };
      setCustomConnectionTypeColors(updatedColors);
      localStorage.setItem('customConnectionTypeColors', JSON.stringify(updatedColors));
      
      setNewConnectionType('');
      setShowAddConnectionType(false);
    }
  };

  const handleRemoveConnectionType = (typeToRemove: string) => {
    const updated = customConnectionTypes.filter(t => t !== typeToRemove);
    setCustomConnectionTypes(updated);
    localStorage.setItem('customConnectionTypes', JSON.stringify(updated));
    
    // Remove color assignment
    const updatedColors = { ...customConnectionTypeColors };
    delete updatedColors[typeToRemove];
    setCustomConnectionTypeColors(updatedColors);
    localStorage.setItem('customConnectionTypeColors', JSON.stringify(updatedColors));
  };

  return (
    <>
      <style>{`
        .pins-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .pins-scrollbar::-webkit-scrollbar-track {
          background: #f3f4f6;
          border-radius: 4px;
        }
        .pins-scrollbar::-webkit-scrollbar-thumb {
          background: #9ca3af;
          border-radius: 4px;
        }
        .pins-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #6b7280;
        }
      `}</style>
      <div className="w-96 h-full bg-white border-l border-gray-200 flex flex-col shadow-lg">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-gray-700" />
          <h2 className="text-lg font-semibold text-gray-900">Architecture Builder</h2>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => {
            setActiveTab('components');
            handleCancel();
          }}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'components'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Package className="h-4 w-4" />
            Components ({blocks.length})
          </div>
        </button>
        <button
          onClick={() => {
            setActiveTab('connections');
            handleCancel();
          }}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'connections'
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <Link2 className="h-4 w-4" />
            Connections ({connections.length})
          </div>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'components' && (
          <div className="p-4 space-y-4">
            {/* Add Component Button */}
            {!isAddingComponent && (
              <Button
                onClick={() => setIsAddingComponent(true)}
                className="w-full"
                variant="outline"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Component
              </Button>
            )}

            {/* Component Form */}
            {isAddingComponent && (
              <div className="space-y-3 p-4 border border-gray-200 rounded-lg bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-sm">
                    {editingComponentId ? 'Edit Component' : 'New Component'}
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancel}
                    className="h-6 w-6 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="text-xs font-medium text-gray-700">ID *</label>
                    <Input
                      value={componentForm.id || ''}
                      onChange={(e) => setComponentForm({ ...componentForm, id: e.target.value })}
                      placeholder="e.g., U1, L1"
                      className="h-8 text-sm"
                      disabled={!!editingComponentId}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-700">Reference *</label>
                    <Input
                      value={componentForm.reference || ''}
                      onChange={(e) => setComponentForm({ ...componentForm, reference: e.target.value })}
                      placeholder="e.g., U1"
                      className="h-8 text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-700">Part Number</label>
                    <Input
                      value={componentForm.partNumber || ''}
                      onChange={(e) => setComponentForm({ ...componentForm, partNumber: e.target.value })}
                      placeholder="e.g., MAX8553E"
                      className="h-8 text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-700">Manufacturer</label>
                    <Input
                      value={componentForm.manufacturer || ''}
                      onChange={(e) => setComponentForm({ ...componentForm, manufacturer: e.target.value })}
                      placeholder="e.g., Maxim Integrated"
                      className="h-8 text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-700">Type *</label>
                    <Input
                      value={componentForm.type || ''}
                      onChange={(e) => setComponentForm({ ...componentForm, type: e.target.value })}
                      placeholder="e.g., IC, INDUCTOR, CAPACITOR"
                      className="h-8 text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-700">Description</label>
                    <Textarea
                      value={componentForm.description || ''}
                      onChange={(e) => setComponentForm({ ...componentForm, description: e.target.value })}
                      placeholder="Component description"
                      className="text-sm min-h-[60px]"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-700">Category</label>
                    <Input
                      value={componentForm.category || ''}
                      onChange={(e) => setComponentForm({ ...componentForm, category: e.target.value })}
                      placeholder="e.g., Power Conversion"
                      className="h-8 text-sm"
                    />
                  </div>

                  {/* Specs Section */}
                  <div className="border-t pt-3 mt-3">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-gray-700">Specifications</label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSpecsEntries([...specsEntries, { key: '', value: '' }])}
                        className="h-6 px-2 text-xs"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Spec
                      </Button>
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {specsEntries.map((spec, index) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            value={spec.key}
                            onChange={(e) => {
                              const newEntries = [...specsEntries];
                              newEntries[index].key = e.target.value;
                              setSpecsEntries(newEntries);
                            }}
                            placeholder="Key (e.g., voltage)"
                            className="h-7 text-xs flex-1"
                          />
                          <Input
                            value={spec.value}
                            onChange={(e) => {
                              const newEntries = [...specsEntries];
                              newEntries[index].value = e.target.value;
                              setSpecsEntries(newEntries);
                            }}
                            placeholder="Value (e.g., 3.3)"
                            className="h-7 text-xs flex-1"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setSpecsEntries(specsEntries.filter((_, i) => i !== index))}
                            className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      {specsEntries.length === 0 && (
                        <p className="text-xs text-gray-400 italic">No specifications added</p>
                      )}
                    </div>
                  </div>

                  {/* Pinout Section */}
                  <div className="border-t pt-3 mt-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-medium text-gray-700">Pinout</label>
                        {pinoutEntries.length > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                            {pinoutEntries.filter(p => p.name?.trim()).length} / {pinoutEntries.length} valid
                          </span>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setPinoutEntries([...pinoutEntries, { name: '', type: 'INPUT', description: '' }])}
                        className="h-6 px-2 text-xs"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Pin
                      </Button>
                    </div>
                    <div className="pins-scrollbar space-y-3 max-h-60 overflow-y-auto -mx-4 px-0">
                      {pinoutEntries.map((pin, index) => {
                        const pinNumber = index + 1; // Dynamic pin number
                        return (
                        <div 
                          key={index} 
                          className="py-3.5 px-0 border-x-0 border-y border-gray-200 bg-gradient-to-br from-white to-gray-50/50 shadow-sm hover:shadow-md hover:border-gray-300 transition-all first:border-t last:border-b"
                        >
                          {/* Row 1: Delete button, Pin number, Pin name */}
                          <div className="flex items-center gap-2.5 mb-2.5 px-4">
                            {/* Delete button on the left */}
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setPinoutEntries(pinoutEntries.filter((_, i) => i !== index))}
                              className="h-7 w-7 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                              title="Remove pin"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                            
                            {/* Pin number - smaller and modern */}
                            <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 text-gray-700 text-[11px] font-semibold flex-shrink-0 shadow-sm">
                              {pinNumber}
                            </div>
                            
                            {/* Pin name input */}
                            <div className="flex-1 min-w-0">
                              <Input
                                value={pin.name}
                                onChange={(e) => {
                                  const newEntries = [...pinoutEntries];
                                  newEntries[index].name = e.target.value;
                                  setPinoutEntries(newEntries);
                                }}
                                placeholder="Pin name (e.g., VIN)"
                                className="h-9 text-sm w-full border-gray-300 focus:border-blue-500 focus:ring-blue-500/20 rounded-lg"
                              />
                              {!pin.name?.trim() && (
                                <p className="text-xs text-red-500 mt-1">Required</p>
                              )}
                            </div>
                          </div>
                          
                          {/* Row 2: Pin type dropdown */}
                          <div className="relative mb-2.5 px-4">
                            <button
                              type="button"
                              onClick={() => {
                                const newSet = new Set(openPinTypeDropdowns);
                                if (newSet.has(index)) {
                                  newSet.delete(index);
                                } else {
                                  newSet.add(index);
                                }
                                setOpenPinTypeDropdowns(newSet);
                              }}
                              className="h-9 w-full px-3 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 flex items-center justify-between gap-2 transition-all shadow-sm hover:shadow"
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div
                                  className="w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm flex-shrink-0"
                                  style={{ backgroundColor: getPinTypeColor(pin.type, customPinTypeColors) }}
                                />
                                <span className="text-sm font-medium text-gray-700 truncate">{pin.type || 'INPUT'}</span>
                              </div>
                              <ChevronDown className={`h-4 w-4 text-gray-500 flex-shrink-0 transition-transform duration-200 ${openPinTypeDropdowns.has(index) ? 'rotate-180' : ''}`} />
                            </button>
                              {openPinTypeDropdowns.has(index) && (
                                <>
                                  <div
                                    className="fixed inset-0 z-10"
                                    onClick={() => {
                                      const newSet = new Set(openPinTypeDropdowns);
                                      newSet.delete(index);
                                      setOpenPinTypeDropdowns(newSet);
                                    }}
                                  />
                                  <div className="absolute z-20 left-4 right-4 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-hidden flex flex-col">
                                    <div className="overflow-y-auto flex-1 pins-scrollbar">
                                      <div className="py-1">
                                        {pinTypes.map((type) => (
                                          <div key={type} className="flex items-center group">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const newEntries = [...pinoutEntries];
                                                newEntries[index].type = type;
                                                setPinoutEntries(newEntries);
                                                const newSet = new Set(openPinTypeDropdowns);
                                                newSet.delete(index);
                                                setOpenPinTypeDropdowns(newSet);
                                              }}
                                              className={`w-full px-3 py-2.5 text-sm text-left flex items-center gap-2.5 transition-all ${
                                                pin.type === type
                                                  ? 'bg-blue-50 text-blue-700 font-medium'
                                                  : 'hover:bg-gray-50 text-gray-700'
                                              }`}
                                            >
                                              <div
                                                className="w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm flex-shrink-0"
                                                style={{ backgroundColor: getPinTypeColor(type, customPinTypeColors) }}
                                              />
                                              <span className="flex-1">{type}</span>
                                              {pin.type === type && (
                                                <span className="text-blue-600 font-semibold text-base">✓</span>
                                              )}
                                            </button>
                                            {customPinTypes.includes(type) && (
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleRemovePinType(type);
                                                }}
                                                className="opacity-0 group-hover:opacity-100 px-2 text-red-500 hover:text-red-700 text-xs transition-opacity"
                                                title="Remove custom type"
                                              >
                                                ×
                                              </button>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                    <div className="border-t border-gray-200 pt-2 pb-2 flex-shrink-0">
                                      {showAddPinType ? (
                                        <div className="px-3 pb-2 flex gap-2">
                                          <Input
                                            value={newPinType}
                                            onChange={(e) => setNewPinType(e.target.value)}
                                            placeholder="New type"
                                            className="h-8 text-sm flex-1 border-gray-300 rounded-lg"
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') {
                                                handleAddPinType();
                                              } else if (e.key === 'Escape') {
                                                setShowAddPinType(false);
                                                setNewPinType('');
                                              }
                                            }}
                                            autoFocus
                                          />
                                          <Button
                                            type="button"
                                            size="sm"
                                            onClick={handleAddPinType}
                                            className="h-8 px-3 text-sm rounded-lg"
                                          >
                                            Add
                                          </Button>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                              setShowAddPinType(false);
                                              setNewPinType('');
                                            }}
                                            className="h-8 w-8 p-0 rounded-lg"
                                          >
                                            ×
                                          </Button>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => setShowAddPinType(true)}
                                          className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2 text-blue-600 font-medium transition-colors rounded-b-lg"
                                        >
                                          <Plus className="h-4 w-4" />
                                          <span>Add custom type</span>
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </>
                              )}
                          </div>
                          
                          {/* Row 3: Pin description */}
                          <div className="px-4">
                            <Input
                              value={pin.description}
                              onChange={(e) => {
                                const newEntries = [...pinoutEntries];
                                newEntries[index].description = e.target.value;
                                setPinoutEntries(newEntries);
                              }}
                              placeholder="Description (optional)"
                              className="h-9 text-sm w-full border-gray-300 focus:border-blue-500 focus:ring-blue-500/20 rounded-lg"
                            />
                          </div>
                        </div>
                      );
                      })}
                      {pinoutEntries.length === 0 && (
                        <p className="text-xs text-gray-400 italic">No pins added</p>
                      )}
                      {pinoutEntries.length > 0 && pinoutEntries.filter(p => p.name?.trim()).length === 0 && (
                        <p className="text-xs text-amber-600 italic">
                          ⚠️ Please fill in Pin name for at least one pin
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={componentForm.isIdentified || false}
                        onChange={(e) => setComponentForm({ ...componentForm, isIdentified: e.target.checked })}
                        className="rounded"
                      />
                      <span>Identified</span>
                    </label>
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={componentForm.isGeneric || false}
                        onChange={(e) => setComponentForm({ ...componentForm, isGeneric: e.target.checked })}
                        className="rounded"
                      />
                      <span>Generic</span>
                    </label>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={handleComponentSubmit}
                      size="sm"
                      className="flex-1"
                      disabled={!componentForm.id || !componentForm.reference || !componentForm.type}
                    >
                      <Save className="h-3 w-3 mr-1" />
                      {editingComponentId ? 'Update' : 'Add'}
                    </Button>
                    <Button
                      onClick={handleCancel}
                      size="sm"
                      variant="outline"
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Components List */}
            <div className="space-y-2">
              {blocks.map((block) => (
                <div
                  key={block.id}
                  className="p-3 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900 truncate">
                        {block.reference} - {block.type}
                      </div>
                      {block.partNumber && (
                        <div className="text-xs text-gray-500 mt-1">{block.partNumber}</div>
                      )}
                      {block.description && (
                        <div className="text-xs text-gray-600 mt-1 line-clamp-2">
                          {block.description}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1 ml-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditComponent(block)}
                        className="h-7 w-7 p-0"
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDeleteComponent(block.id)}
                        className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'connections' && (
          <div className="p-4 space-y-4">
            {/* Add Connection Button */}
            {!isAddingConnection && (
              <Button
                onClick={() => setIsAddingConnection(true)}
                className="w-full"
                variant="outline"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Connection
              </Button>
            )}

            {/* Connection Form */}
            {isAddingConnection && (
              <div className="space-y-3 p-4 border border-gray-200 rounded-lg bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-sm">
                    {editingConnectionId ? 'Edit Connection' : 'New Connection'}
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCancel}
                    className="h-6 w-6 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <div>
                    <label className="text-xs font-medium text-gray-700">From Component *</label>
                    <select
                      value={connectionForm.from || ''}
                      onChange={(e) => setConnectionForm({ ...connectionForm, from: e.target.value })}
                      className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    >
                      <option value="">Select source component</option>
                      {blocks.map((block) => (
                        <option key={block.id} value={block.id}>
                          {block.reference} - {block.type}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-700">To Component *</label>
                    <select
                      value={connectionForm.to || ''}
                      onChange={(e) => setConnectionForm({ ...connectionForm, to: e.target.value })}
                      className="w-full h-9 px-3 text-sm border border-gray-300 rounded-md bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    >
                      <option value="">Select target component</option>
                      {blocks
                        .filter((block) => block.id !== connectionForm.from)
                        .map((block) => (
                          <option key={block.id} value={block.id}>
                            {block.reference} - {block.type}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-medium text-gray-700">Connection Type *</label>
                    </div>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          setOpenConnectionTypeDropdown(!openConnectionTypeDropdown);
                          setShowAddConnectionType(false);
                        }}
                        className="h-9 w-full px-3 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 flex items-center justify-between gap-2 transition-all shadow-sm hover:shadow"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div
                            className="w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm flex-shrink-0"
                            style={{ backgroundColor: getConnectionTypeColor(connectionForm.type || 'signal', customConnectionTypeColors) }}
                          />
                          <span className="text-sm font-medium text-gray-700 truncate">
                            {(connectionForm.type || 'signal').charAt(0).toUpperCase() + (connectionForm.type || 'signal').slice(1).replace(/_/g, ' ')}
                          </span>
                        </div>
                        <ChevronDown className={`h-4 w-4 text-gray-500 flex-shrink-0 transition-transform duration-200 ${openConnectionTypeDropdown ? 'rotate-180' : ''}`} />
                      </button>
                      {openConnectionTypeDropdown && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setOpenConnectionTypeDropdown(false)}
                          />
                          <div className="absolute z-20 left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-hidden flex flex-col">
                            <div className="overflow-y-auto flex-1 pins-scrollbar">
                              <div className="py-1">
                                {connectionTypes.map((type) => (
                                  <div key={type} className="flex items-center group">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setConnectionForm({
                                          ...connectionForm,
                                          type: type as ConnectionData['type'],
                                        });
                                        setOpenConnectionTypeDropdown(false);
                                      }}
                                      className={`w-full px-3 py-2.5 text-sm text-left flex items-center gap-2.5 transition-all ${
                                        connectionForm.type === type
                                          ? 'bg-blue-50 text-blue-700 font-medium'
                                          : 'hover:bg-gray-50 text-gray-700'
                                      }`}
                                    >
                                      <div
                                        className="w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm flex-shrink-0"
                                        style={{ backgroundColor: getConnectionTypeColor(type, customConnectionTypeColors) }}
                                      />
                                      <span className="flex-1">{type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ')}</span>
                                      {connectionForm.type === type && (
                                        <span className="text-blue-600 font-semibold text-base">✓</span>
                                      )}
                                    </button>
                                    {customConnectionTypes.includes(type) && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRemoveConnectionType(type);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 px-2 text-red-500 hover:text-red-700 text-xs transition-opacity"
                                        title="Remove custom type"
                                      >
                                        ×
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="border-t border-gray-200 pt-2 pb-2 flex-shrink-0">
                              {showAddConnectionType ? (
                                <div className="px-3 pb-2 flex gap-2">
                                  <Input
                                    value={newConnectionType}
                                    onChange={(e) => setNewConnectionType(e.target.value)}
                                    placeholder="New type"
                                    className="h-8 text-sm flex-1 border-gray-300 rounded-lg"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        handleAddConnectionType();
                                      } else if (e.key === 'Escape') {
                                        setShowAddConnectionType(false);
                                        setNewConnectionType('');
                                      }
                                    }}
                                    autoFocus
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={handleAddConnectionType}
                                    className="h-8 px-3 text-sm rounded-lg"
                                  >
                                    Add
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setShowAddConnectionType(false);
                                      setNewConnectionType('');
                                    }}
                                    className="h-8 w-8 p-0 rounded-lg"
                                  >
                                    ×
                                  </Button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setShowAddConnectionType(true)}
                                  className="w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2 text-blue-600 font-medium transition-colors rounded-b-lg"
                                >
                                  <Plus className="h-4 w-4" />
                                  <span>Add custom type</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-700">Signal Name</label>
                    <Input
                      value={connectionForm.signal_name || ''}
                      onChange={(e) =>
                        setConnectionForm({ ...connectionForm, signal_name: e.target.value })
                      }
                      placeholder="e.g., VIN_FILTERED"
                      className="h-8 text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-700">Label</label>
                    <Input
                      value={connectionForm.label || ''}
                      onChange={(e) => setConnectionForm({ ...connectionForm, label: e.target.value })}
                      placeholder="Connection label"
                      className="h-8 text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-700">Pins/Voltage</label>
                    <Input
                      value={connectionForm.pins || ''}
                      onChange={(e) => setConnectionForm({ ...connectionForm, pins: e.target.value })}
                      placeholder="e.g., 3.0-5.5V or Pin 7"
                      className="h-8 text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-700">From Pin</label>
                    <Input
                      value={connectionForm.from_pin || ''}
                      onChange={(e) => setConnectionForm({ ...connectionForm, from_pin: e.target.value })}
                      placeholder="e.g., LX (Pin 7)"
                      className="h-8 text-sm"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-gray-700">To Pin</label>
                    <Input
                      value={connectionForm.to_pin || ''}
                      onChange={(e) => setConnectionForm({ ...connectionForm, to_pin: e.target.value })}
                      placeholder="e.g., VIN (Pin 1)"
                      className="h-8 text-sm"
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    {!editingConnectionId && !connectionPinsComplete && (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        New manual connections must specify both endpoint pins.
                      </div>
                    )}

                    <Button
                      onClick={handleConnectionSubmit}
                      size="sm"
                      className="flex-1"
                      disabled={!canSubmitConnection}
                    >
                      <Save className="h-3 w-3 mr-1" />
                      {editingConnectionId ? 'Update' : 'Add'}
                    </Button>
                    <Button
                      onClick={handleCancel}
                      size="sm"
                      variant="outline"
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Connections List */}
            <div className="space-y-2">
              {connections.map((conn) => {
                const fromBlock = blocks.find((b) => b.id === conn.from);
                const toBlock = blocks.find((b) => b.id === conn.to);
                const pct = conn.confidence != null ? Math.round(conn.confidence * 100) : null;
                const confColor = pct == null ? '' : pct >= 80 ? 'bg-green-100 text-green-700' : pct >= 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700';
                return (
                  <div
                    key={conn.id}
                    className="p-3 border border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-gray-500">
                            {fromBlock?.reference || conn.from}
                          </span>
                          <span className="text-gray-400">→</span>
                          <span className="text-xs font-medium text-gray-500">
                            {toBlock?.reference || conn.to}
                          </span>
                          {pct != null && (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${confColor}`}>
                              {pct}%
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          <span className="font-medium">{conn.type}</span>
                          {conn.signal_name && (
                            <span className="ml-2">• {conn.signal_name}</span>
                          )}
                        </div>
                        {(conn.reasoning || conn.label) && (
                          <div className="text-xs text-gray-400 mt-1 line-clamp-2">
                            {conn.reasoning || conn.label}
                          </div>
                        )}
                        {conn.source_requirement_ids && conn.source_requirement_ids.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {conn.source_requirement_ids.map((rid) => (
                              <span
                                key={rid}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-mono border border-blue-200"
                                title={`Requirement: ${rid}`}
                              >
                                {rid.length > 12 ? `${rid.slice(0, 10)}…` : rid}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1 ml-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditConnection(conn)}
                          className="h-7 w-7 p-0"
                        >
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDeleteConnection(conn.id)}
                          className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
