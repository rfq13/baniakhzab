package db

import (
	"container/list"
	"context"
)

type RelationEdgeKind string

const (
	RelationEdgeParent RelationEdgeKind = "parent"
	RelationEdgeSpouse RelationEdgeKind = "spouse"
)

type RelationEdgeDir string

const (
	RelationDirToParent RelationEdgeDir = "to_parent"
	RelationDirToChild  RelationEdgeDir = "to_child"
	RelationDirSpouse   RelationEdgeDir = "spouse"
)

type RelationEdge struct {
	ToID string
	Kind RelationEdgeKind
	Dir  RelationEdgeDir
}

type RelationStep struct {
	FromID string
	ToID   string
	Kind   RelationEdgeKind
	Dir    RelationEdgeDir
}

type RelationPath struct {
	Nodes  []string
	Steps  []RelationStep
	Length int
}

type FamilyGraph struct {
	Nodes map[string][]RelationEdge
}

func BuildFamilyGraph(ctx context.Context, persons []Person) *FamilyGraph {
	graph := &FamilyGraph{Nodes: make(map[string][]RelationEdge)}

	ensure := func(id string) {
		if _, ok := graph.Nodes[id]; !ok {
			graph.Nodes[id] = []RelationEdge{}
		}
	}

	for _, p := range persons {
		ensure(p.ID)
	}

	personMap := make(map[string]Person, len(persons))
	for _, p := range persons {
		personMap[p.ID] = p
	}

	for _, p := range persons {
		pid := p.ID

		if p.FatherID != nil {
			fid := *p.FatherID
			if _, ok := personMap[fid]; ok {
				ensure(pid)
				ensure(fid)
				graph.Nodes[pid] = append(graph.Nodes[pid], RelationEdge{
					ToID: fid,
					Kind: RelationEdgeParent,
					Dir:  RelationDirToParent,
				})
				graph.Nodes[fid] = append(graph.Nodes[fid], RelationEdge{
					ToID: pid,
					Kind: RelationEdgeParent,
					Dir:  RelationDirToChild,
				})
			}
		}

		if p.MotherID != nil {
			mid := *p.MotherID
			if _, ok := personMap[mid]; ok {
				ensure(pid)
				ensure(mid)
				graph.Nodes[pid] = append(graph.Nodes[pid], RelationEdge{
					ToID: mid,
					Kind: RelationEdgeParent,
					Dir:  RelationDirToParent,
				})
				graph.Nodes[mid] = append(graph.Nodes[mid], RelationEdge{
					ToID: pid,
					Kind: RelationEdgeParent,
					Dir:  RelationDirToChild,
				})
			}
		}

		for _, sid := range p.SpouseIDs {
			if sid == pid {
				continue
			}
			if _, ok := personMap[sid]; !ok {
				continue
			}
			ensure(pid)
			ensure(sid)
			graph.Nodes[pid] = append(graph.Nodes[pid], RelationEdge{
				ToID: sid,
				Kind: RelationEdgeSpouse,
				Dir:  RelationDirSpouse,
			})
		}
	}

	return graph
}

func (g *FamilyGraph) FindShortestPaths(fromID, toID string, allowParent, allowSpouse bool, maxSteps int) ([]RelationPath, int) {
	if g == nil {
		return nil, 0
	}
	if fromID == "" || toID == "" || fromID == toID {
		return nil, 0
	}
	if _, ok := g.Nodes[fromID]; !ok {
		return nil, 0
	}
	if _, ok := g.Nodes[toID]; !ok {
		return nil, 0
	}

	if maxSteps <= 0 {
		maxSteps = 16
	}

	dist := make(map[string]int)
	prev := make(map[string][]string)

	q := list.New()
	dist[fromID] = 0
	q.PushBack(fromID)

	for q.Len() > 0 {
		front := q.Front()
		q.Remove(front)
		id := front.Value.(string)
		d := dist[id]
		if d >= maxSteps {
			continue
		}
		edges := g.Nodes[id]
		for _, e := range edges {
			if e.Kind == RelationEdgeParent && !allowParent {
				continue
			}
			if e.Kind == RelationEdgeSpouse && !allowSpouse {
				continue
			}
			nd := d + 1
			if old, ok := dist[e.ToID]; !ok || nd < old {
				dist[e.ToID] = nd
				prev[e.ToID] = []string{id}
				q.PushBack(e.ToID)
			} else if nd == dist[e.ToID] {
				listPrev := prev[e.ToID]
				found := false
				for _, v := range listPrev {
					if v == id {
						found = true
						break
					}
				}
				if !found {
					prev[e.ToID] = append(prev[e.ToID], id)
				}
			}
		}
	}

	targetDist, ok := dist[toID]
	if !ok {
		return nil, 0
	}

	var paths [][]string
	var stack []string

	var backtrack func(curr string)
	backtrack = func(curr string) {
		stack = append(stack, curr)
		if curr == fromID {
			nodes := make([]string, len(stack))
			for i := range stack {
				nodes[len(stack)-1-i] = stack[i]
			}
			paths = append(paths, nodes)
		} else {
			for _, p := range prev[curr] {
				backtrack(p)
			}
		}
		stack = stack[:len(stack)-1]
	}

	backtrack(toID)

	result := make([]RelationPath, 0, len(paths))
	for _, nodes := range paths {
		if len(nodes) < 2 {
			continue
		}
		steps := make([]RelationStep, 0, len(nodes)-1)
		for i := 0; i < len(nodes)-1; i++ {
			a := nodes[i]
			b := nodes[i+1]
			var edge *RelationEdge
			for _, e := range g.Nodes[a] {
				if e.ToID == b {
					edge = &e
					break
				}
			}
			if edge != nil {
				steps = append(steps, RelationStep{
					FromID: a,
					ToID:   b,
					Kind:   edge.Kind,
					Dir:    edge.Dir,
				})
			} else {
				steps = append(steps, RelationStep{
					FromID: a,
					ToID:   b,
				})
			}
		}
		result = append(result, RelationPath{
			Nodes:  nodes,
			Steps:  steps,
			Length: len(nodes) - 1,
		})
	}

	return result, targetDist
}

