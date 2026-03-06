package llm

import (
	"context"
	"fmt"
	"log"
	"strings"

	"github.com/baniakhzab/backend/internal/db"
)

// ChatWithMemory — Smart Hybrid: all queries go through agent.
// Agent will automatically choose the right tools and optimize for simple queries.
func (c *Client) ChatWithMemory(ctx context.Context, store *db.Store, user *db.Person, waNumber, query string) (string, error) {
	if c.apiKey == "" {
		return "", fmt.Errorf("LLM_API_KEY is not configured")
	}

	// 1. Load state + recent history
	state, err := store.Chat.GetState(ctx, waNumber)
	if err != nil {
		return "", fmt.Errorf("load state: %w", err)
	}
	history, err := store.Chat.GetRecentMessages(ctx, waNumber, 10)
	if err != nil {
		return "", fmt.Errorf("load history: %w", err)
	}

	// 2. Save user message
	_ = store.Chat.SaveMessage(ctx, waNumber, "user", query, "")

	// 3. ALL queries go through agent with optimization
	// Agent will automatically handle simple vs complex queries
	response, err := c.runComplexQuery(ctx, store, user, history, buildStateSummaryWithNames(ctx, store, state), query)
	if err != nil {
		log.Printf("[ERROR] Agent error: %v\n", err)
		response = "Maaf, terjadi kesalahan saat memproses pertanyaan Anda. Coba ulangi beberapa saat lagi."
	}

	// 4. Save assistant message + update state
	_ = store.Chat.SaveMessage(ctx, waNumber, "assistant", response, "agent")
	return response, nil
}

// buildStateSummaryWithNames resolves person IDs in state to actual names for better context
func buildStateSummaryWithNames(ctx context.Context, store *db.Store, state *db.GenealogyState) string {
	resolve := func(id *string) string {
		if id == nil {
			return ""
		}
		p, err := store.Persons.GetByID(ctx, *id)
		if err != nil || p == nil {
			return *id
		}
		return p.FullName
	}
	parts := []string{}
	if state.CurrentPersonID != nil {
		parts = append(parts, fmt.Sprintf("current=%s", resolve(state.CurrentPersonID)))
	}
	if state.LastReferencedPersonID != nil {
		parts = append(parts, fmt.Sprintf("last_ref=%s", resolve(state.LastReferencedPersonID)))
	}
	if state.ComparisonPersonID != nil {
		parts = append(parts, fmt.Sprintf("compare=%s", resolve(state.ComparisonPersonID)))
	}
	if len(parts) == 0 {
		return "empty"
	}
	return strings.Join(parts, ", ")
}
