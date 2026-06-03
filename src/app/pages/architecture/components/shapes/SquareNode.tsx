import { createElement, memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { Component } from '@/app/types';
import { getComponentIcon, getTypeColor, getTypeBorderColor } from './shapeUtils';

interface ComponentNodeData extends Component {
  category?: string;
  shape?: 'diamond' | 'circle' | 'square' | 'triangle';
}

interface SquareNodeProps {
  data: ComponentNodeData;
  selected?: boolean;
}

export const SquareNode = memo(({ data, selected }: SquareNodeProps) => {
  const gradientClass = getTypeColor(data.type);
  const borderColor = getTypeBorderColor(data.type, selected || false);
  const icon = createElement(getComponentIcon(data.type), { className: 'h-4 w-4 text-white' });

  return (
    <div className="relative">
      {/* Input Handles */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-blue-500 border-2 border-white"
        style={{ top: '25%' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-green-500 border-2 border-white"
        style={{ top: '50%' }}
      />
      <Handle
        type="target"
        position={Position.Left}
        className="w-3 h-3 bg-gray-500 border-2 border-white"
        style={{ top: '75%' }}
      />
      
      {/* Square Shape */}
      <div className="relative" style={{ width: '180px', height: '180px' }}>
        <svg
          width="180"
          height="180"
          className={`transition-all ${selected ? 'scale-105' : ''}`}
        >
          <defs>
            <linearGradient id={`square-gradient-${data.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={gradientClass.includes('purple') ? '#a855f7' : 
                                           gradientClass.includes('green') ? '#22c55e' :
                                           gradientClass.includes('amber') ? '#f59e0b' :
                                           gradientClass.includes('red') ? '#ef4444' :
                                           gradientClass.includes('blue') ? '#3b82f6' : '#6b7280'} />
              <stop offset="100%" stopColor={gradientClass.includes('purple') ? '#9333ea' : 
                                            gradientClass.includes('green') ? '#16a34a' :
                                            gradientClass.includes('amber') ? '#d97706' :
                                            gradientClass.includes('red') ? '#dc2626' :
                                            gradientClass.includes('blue') ? '#2563eb' : '#4b5563'} />
            </linearGradient>
          </defs>
          <rect
            x="4"
            y="4"
            width="172"
            height="172"
            rx="8"
            fill={`url(#square-gradient-${data.id})`}
            fillOpacity="0.1"
            stroke={borderColor}
            strokeWidth={selected ? '3' : '2'}
            className={selected ? 'drop-shadow-lg' : 'drop-shadow-md'}
          />
        </svg>
        
        {/* Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center p-3">
          {/* Header with Icon */}
          <div className={`flex items-center gap-2 mb-2 p-2 rounded-lg bg-gradient-to-r ${gradientClass} w-full justify-center`}>
            {icon}
            <div className="text-xs font-bold text-white truncate max-w-[100px]">
              {data.reference}
            </div>
          </div>
          
          {/* Part Number */}
          {data.partNumber && (
            <div className="text-[10px] text-gray-700 font-medium truncate max-w-[150px] text-center mb-1">
              {data.partNumber}
            </div>
          )}
          
          {/* Manufacturer */}
          {data.manufacturer && (
            <div className="text-[9px] text-gray-500 truncate max-w-[150px] text-center mb-1">
              {data.manufacturer}
            </div>
          )}
          
          {/* Category */}
          {data.category && (
            <div className="text-[9px] text-gray-400 truncate max-w-[150px] text-center mb-1">
              {data.category}
            </div>
          )}
          
          {/* Specs */}
          {data.specs.voltage && (
            <div className="text-[9px] text-gray-600 mt-1 text-center">
              {data.specs.voltage}V
              {data.specs.current && ` @ ${data.specs.current}A`}
            </div>
          )}
          
          {/* Type */}
          {data.type && (
            <div className="text-[8px] text-gray-400 truncate max-w-[150px] text-center mt-1">
              {data.type}
            </div>
          )}
        </div>
      </div>

      {/* Output Handles */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-blue-500 border-2 border-white"
        style={{ top: '25%' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-green-500 border-2 border-white"
        style={{ top: '50%' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="w-3 h-3 bg-gray-500 border-2 border-white"
        style={{ top: '75%' }}
      />
    </div>
  );
});

SquareNode.displayName = 'SquareNode';
