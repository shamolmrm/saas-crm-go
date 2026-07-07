'use client'

import {
  DndContext, DragOverlay, closestCorners,
  type DragStartEvent, type DragEndEvent,
  useDroppable, useDraggable,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'
import type { Pipeline, Deal } from '@/lib/api'

interface KanbanBoardProps {
  pipeline: Pipeline
  onMoveDeal: (dealId: string, stageId: string, newPosition: number) => Promise<void>
}

export function KanbanBoard({ pipeline, onMoveDeal }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const activeDeal = activeId
    ? pipeline.stages.flatMap(s => s.deals).find(d => d.id === activeId)
    : null

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id))
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    const dealId  = String(active.id)
    const overId  = String(over.id)

    // over.id could be a stageId (dropping onto an empty column) or a dealId
    const targetStage = pipeline.stages.find(s =>
      s.id === overId || s.deals.some(d => d.id === overId)
    )
    if (!targetStage) return

    const overDeal = targetStage.deals.find(d => d.id === overId)
    const newPosition = overDeal ? overDeal.position : targetStage.deals.length

    await onMoveDeal(dealId, targetStage.id, newPosition)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto p-6 h-full">
        {pipeline.stages.map(stage => (
          <KanbanColumn key={stage.id} stage={stage} />
        ))}
      </div>

      <DragOverlay>
        {activeDeal && <DealCard deal={activeDeal} isDragging />}
      </DragOverlay>
    </DndContext>
  )
}

function KanbanColumn({ stage }: { stage: Pipeline['stages'][0] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })
  const totalValue = stage.deals.reduce((sum, d) => sum + (d.value ?? 0), 0)

  return (
    <div className="flex-shrink-0 w-72">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-medium text-sm">{stage.name}</h3>
          <p className="text-xs text-muted-foreground">
            {stage.deals.length} deal{stage.deals.length !== 1 ? 's' : ''}
            {totalValue > 0 && ` · $${totalValue.toLocaleString()}`}
          </p>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={`min-h-48 rounded-lg p-2 space-y-2 transition-colors ${
          isOver ? 'bg-primary/5 border-2 border-primary/20 border-dashed' : 'bg-muted/40'
        }`}
      >
        <SortableContext items={stage.deals.map(d => d.id)} strategy={verticalListSortingStrategy}>
          {stage.deals.map(deal => (
            <SortableDealCard key={deal.id} deal={deal} />
          ))}
        </SortableContext>

        {stage.deals.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-xs">
            Drop deals here
          </div>
        )}
      </div>
    </div>
  )
}

function SortableDealCard({ deal }: { deal: Deal }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: deal.id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
    >
      <DealCard deal={deal} isDragging={isDragging} />
    </div>
  )
}

function DealCard({ deal, isDragging }: { deal: Deal; isDragging?: boolean }) {
  return (
    <div className={`bg-card border rounded-md p-3 cursor-grab active:cursor-grabbing shadow-sm transition-shadow ${
      isDragging ? 'shadow-lg opacity-80 rotate-1' : 'hover:shadow-md'
    }`}>
      <p className="text-sm font-medium leading-snug mb-1.5">{deal.title}</p>
      {deal.contact && (
        <p className="text-xs text-muted-foreground mb-1.5">{deal.contact.name}</p>
      )}
      <div className="flex items-center justify-between">
        {deal.value != null ? (
          <span className="text-xs font-medium text-primary">
            {deal.currency} {deal.value.toLocaleString()}
          </span>
        ) : <span />}
        {deal.owner && (
          <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-medium">
            {deal.owner.name.charAt(0)}
          </div>
        )}
      </div>
    </div>
  )
}
