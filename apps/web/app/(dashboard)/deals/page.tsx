'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { pipelineApi, dealsApi } from '@/lib/api'
import { KanbanBoard }          from '@/components/KanbanBoard'
import { AddDealModal }         from '@/components/AddDealModal'
import { useState }             from 'react'
import { Plus }                 from 'lucide-react'

export default function DealsPage() {
  const queryClient = useQueryClient()
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null)
  const [showAddDeal, setShowAddDeal] = useState(false)

  const { data: pipelines = [], isLoading: loadingPipelines } = useQuery({
    queryKey: ['pipelines'],
    queryFn:  () => pipelineApi.list().then(r => r.data),
    select:   (data) => {
      if (!selectedPipelineId && data.length > 0) {
        setSelectedPipelineId(data.find(p => p.isDefault)?.id ?? data[0].id)
      }
      return data
    },
  })

  const activePipelineId = selectedPipelineId ?? pipelines[0]?.id

  const { data: board, isLoading: loadingBoard } = useQuery({
    queryKey: ['board', activePipelineId],
    queryFn:  () => dealsApi.board(activePipelineId!).then(r => r.data),
    enabled:  !!activePipelineId,
  })

  const moveMutation = useMutation({
    mutationFn: ({ dealId, stageId, position }: { dealId: string; stageId: string; position: number }) =>
      dealsApi.move(dealId, stageId, position),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['board', activePipelineId] }),
  })

  if (loadingPipelines) return <div className="p-6 text-muted-foreground text-sm">Loading…</div>

  if (pipelines.length === 0) {
    return (
      <div className="p-6">
        <div className="border rounded-lg p-12 text-center">
          <h2 className="font-medium mb-1">No pipeline yet</h2>
          <p className="text-sm text-muted-foreground">Contact your admin to set up a sales pipeline.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {showAddDeal && (
        <AddDealModal
          defaultPipelineId={activePipelineId}
          onClose={() => setShowAddDeal(false)}
        />
      )}
      {/* Toolbar */}
      <div className="px-6 py-3 border-b flex items-center gap-4">
        {pipelines.length > 1 && (
          <select
            value={activePipelineId ?? ''}
            onChange={e => setSelectedPipelineId(e.target.value)}
            className="border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {pipelines.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
        <button
          className="ml-auto flex items-center gap-1.5 bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90"
          onClick={() => setShowAddDeal(true)}
        >
          <Plus size={14} /> Add deal
        </button>
      </div>

      {/* Kanban */}
      <div className="flex-1 overflow-hidden">
        {loadingBoard || !board ? (
          <div className="flex gap-4 p-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="w-72 h-64 bg-muted/40 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="h-full overflow-auto">
            <KanbanBoard
              pipeline={board}
              onMoveDeal={(dealId, stageId, position) =>
                moveMutation.mutateAsync({ dealId, stageId, position }).then(() => undefined)
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}
