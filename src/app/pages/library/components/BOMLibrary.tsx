import { useState } from 'react';
import type { BOMSession } from '@/app/types';
import { FileText, CheckCircle2, AlertTriangle, Clock, Search, Plus, ChevronRight, Cpu, Package } from 'lucide-react';
import { Button } from '@/app/shared/components/ui/button';
import { Input } from '@/app/shared/components/ui/input';
import { Badge } from '@/app/shared/components/ui/badge';
import { TOTAL_WORKFLOW_STAGES, WORKFLOW_STAGES } from '@/app/shared/utils/workflowStages';

interface BOMLibraryProps {
  sessions: BOMSession[];
  onSelectSession: (session: BOMSession) => void;
  onNewBOM: () => void;
}

export function BOMLibrary({ sessions, onSelectSession, onNewBOM }: BOMLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'complete' | 'in-progress'>('all');

  const getStageLabel = (stage: string, stageNumber?: number) => {
    return WORKFLOW_STAGES.find(item => item.stageNumber === stageNumber || item.id === stage)?.label || stage;
  };

  const getStageProgress = (stage: string, stageNumber?: number) => {
    // If we have the original stage number, use it directly for accurate progress
    if (stageNumber !== undefined) {
      return (stageNumber / TOTAL_WORKFLOW_STAGES) * 100;
    }
    const currentIndex = WORKFLOW_STAGES.findIndex(item => item.id === stage);
    if (currentIndex === -1) return 0;
    return ((currentIndex + 1) / TOTAL_WORKFLOW_STAGES) * 100;
  };

  const isComplete = (session: BOMSession) => session.stage === 'review' || (session.stage === 'subsystems' && session.complianceScore !== undefined);

  const filteredSessions = sessions.filter((session) => {
    const matchesSearch = session.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      session.systemType?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesFilter = 
      filterStatus === 'all' ||
      (filterStatus === 'complete' && isComplete(session)) ||
      (filterStatus === 'in-progress' && !isComplete(session));

    return matchesSearch && matchesFilter;
  });

  const completedCount = sessions.filter(isComplete).length;
  const inProgressCount = sessions.length - completedCount;

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm px-8 py-6 shadow-sm">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 p-3 shadow-lg">
                <Cpu className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">BOM Evolution Platform</h1>
                <p className="text-sm text-gray-600 mt-1">
                  Transform, analyze, and optimize your bill of materials
                </p>
              </div>
            </div>
            
            <Button
              onClick={onNewBOM}
              size="lg"
              className="gap-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-lg"
            >
              <Plus className="h-5 w-5" />
              Upload New BOM
            </Button>
          </div>
        </div>
      </header>

      {/* Stats Bar */}
      <div className="border-b bg-white/60 backdrop-blur-sm px-8 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex gap-8">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-100 p-2">
                  <Package className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{sessions.length}</div>
                  <div className="text-xs text-gray-600">Total BOMs</div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-green-100 p-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{completedCount}</div>
                  <div className="text-xs text-gray-600">Completed</div>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-yellow-100 p-2">
                  <Clock className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900">{inProgressCount}</div>
                  <div className="text-xs text-gray-600">In Progress</div>
                </div>
              </div>
            </div>

            {/* Search and Filter */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search BOMs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>
              
              <div className="flex gap-2">
                <Button
                  variant={filterStatus === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus('all')}
                >
                  All
                </Button>
                <Button
                  variant={filterStatus === 'complete' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus('complete')}
                >
                  Complete
                </Button>
                <Button
                  variant={filterStatus === 'in-progress' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterStatus('in-progress')}
                >
                  In Progress
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* BOM List */}
      <main className="flex-1 overflow-auto px-8 py-6">
        <div className="max-w-7xl mx-auto">
          {filteredSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[400px]">
              <div className="rounded-full bg-gray-100 p-6 mb-4">
                <FileText className="h-12 w-12 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No BOMs found</h3>
              <p className="text-gray-600 mb-6">
                {searchQuery ? 'No BOMs match your search' : 'Upload your first BOM to get started'}
              </p>
              {!searchQuery && (
                <Button onClick={onNewBOM} size="lg" className="gap-2">
                  <Plus className="h-5 w-5" />
                  Upload New BOM
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredSessions.map((session) => {
                const complete = isComplete(session);
                // Use currentStageNumber if available (from LibraryPage), otherwise fallback to stage name
                const stageNumber = (session as any).currentStageNumber;
                const progress = complete ? 100 : getStageProgress(session.stage, stageNumber);
                
                return (
                  <button
                    key={session.id}
                    onClick={() => onSelectSession(session)}
                    className="group relative overflow-hidden rounded-xl border-2 border-gray-200 bg-white p-6 text-left shadow-sm transition-all hover:border-blue-400 hover:shadow-lg"
                  >
                    {/* Background gradient on hover */}
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-50 to-purple-50 opacity-0 transition-opacity group-hover:opacity-100" />
                    
                    <div className="relative">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                              {session.name}
                            </h3>
                            {complete ? (
                              <Badge className="bg-green-100 text-green-700 border-green-200">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Complete
                              </Badge>
                            ) : (
                              <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
                                <Clock className="h-3 w-3 mr-1" />
                                {getStageLabel(session.stage, stageNumber)}
                              </Badge>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            {session.systemType && (
                              <span className="flex items-center gap-1">
                                <Cpu className="h-4 w-4" />
                                {session.systemType}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Package className="h-4 w-4" />
                              {session.totalComponents} components
                            </span>
                            <span>Version {session.version}</span>
                            <span>•</span>
                            <span>{new Date(session.updatedAt).toLocaleString()}</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          {session.complianceScore !== undefined && (
                            <div className="text-right">
                              <div className={`text-3xl font-bold ${
                                session.complianceScore >= 70
                                  ? 'text-green-600'
                                  : session.complianceScore >= 40
                                  ? 'text-yellow-600'
                                  : 'text-red-600'
                              }`}>
                                {session.complianceScore}%
                              </div>
                              <div className="text-xs text-gray-600">Compliance</div>
                            </div>
                          )}
                          
                          <ChevronRight className="h-6 w-6 text-gray-400 transition-transform group-hover:translate-x-1 group-hover:text-blue-600" />
                        </div>
                      </div>
                      
                      {/* Progress Bar */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-gray-700">
                            {complete ? 'Workflow Complete' : `Stage: ${getStageLabel(session.stage, stageNumber)}`}
                          </span>
                          <span className="text-gray-600">{Math.round(progress)}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 ${
                              complete
                                ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                                : 'bg-gradient-to-r from-blue-500 to-blue-600'
                            }`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                      
                      {/* Compliance Info - Only show for completed sessions */}
                      {complete && session.complianceScore !== undefined && (
                        <div className="mt-4 flex items-center gap-4 pt-4 border-t border-gray-100">
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                            <span className="text-gray-700">
                              <span className="font-semibold">{session.compliantComponents}</span> compliant
                            </span>
                          </div>
                          {session.compliantComponents < session.totalComponents && (
                            <div className="flex items-center gap-2 text-sm">
                              <AlertTriangle className="h-4 w-4 text-red-600" />
                              <span className="text-gray-700">
                                <span className="font-semibold">{session.totalComponents - session.compliantComponents}</span> need attention
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
