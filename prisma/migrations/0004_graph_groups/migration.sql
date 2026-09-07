-- Рамки графа: parentId у нод, kind у рёбер канваса
ALTER TABLE "GraphNode" ADD COLUMN "parentId" TEXT;
CREATE INDEX "GraphNode_parentId_idx" ON "GraphNode"("parentId");
ALTER TABLE "GraphEdge" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'canvas';
