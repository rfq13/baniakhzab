package db

import (
	"context"
	"database/sql"
	"time"
)

// GenealogyState holds structured conversation state per user.
type GenealogyState struct {
	WANumber               string    `json:"wa_number"`
	CurrentPersonID        *string   `json:"current_person_id,omitempty"`
	LastReferencedPersonID *string   `json:"last_referenced_person_id,omitempty"`
	ActiveLineageRootID    *string   `json:"active_lineage_root_id,omitempty"`
	ComparisonPersonID     *string   `json:"comparison_person_id,omitempty"`
	UpdatedAt              time.Time `json:"updated_at"`
}

// ChatMessage represents a single message in conversation history.
type ChatMessage struct {
	ID        int       `json:"id"`
	WANumber  string    `json:"wa_number"`
	Role      string    `json:"role"` // "user" or "assistant"
	Content   string    `json:"content"`
	AgentType string    `json:"agent_type"` // "lineage", "ajnabiyyah", "clarification", "general"
	CreatedAt time.Time `json:"created_at"`
}

// ChatStore manages conversation memory tables.
type ChatStore struct {
	DB *sql.DB
}

// EnsureTable creates chat_messages and chat_state tables if they don't exist.
func (s ChatStore) EnsureTable(ctx context.Context) error {
	const messagesQ = `
		CREATE TABLE IF NOT EXISTS chat_messages (
			id SERIAL PRIMARY KEY,
			wa_number TEXT NOT NULL,
			role TEXT NOT NULL,
			content TEXT NOT NULL,
			agent_type TEXT DEFAULT '',
			created_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)
	`
	if _, err := s.DB.ExecContext(ctx, messagesQ); err != nil {
		return err
	}

	const indexQ = `CREATE INDEX IF NOT EXISTS idx_chat_wa ON chat_messages(wa_number, created_at DESC)`
	if _, err := s.DB.ExecContext(ctx, indexQ); err != nil {
		return err
	}

	const stateQ = `
		CREATE TABLE IF NOT EXISTS chat_state (
			wa_number TEXT PRIMARY KEY,
			current_person_id TEXT,
			last_referenced_person_id TEXT,
			active_lineage_root_id TEXT,
			comparison_person_id TEXT,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)
	`
	_, err := s.DB.ExecContext(ctx, stateQ)
	return err
}

// SaveMessage inserts a chat message into history.
func (s ChatStore) SaveMessage(ctx context.Context, waNumber, role, content, agentType string) error {
	const q = `
		INSERT INTO chat_messages (wa_number, role, content, agent_type)
		VALUES ($1, $2, $3, $4)
	`
	_, err := s.DB.ExecContext(ctx, q, waNumber, role, content, agentType)
	return err
}

// GetRecentMessages returns the last N messages for a given WA number, oldest first.
func (s ChatStore) GetRecentMessages(ctx context.Context, waNumber string, limit int) ([]ChatMessage, error) {
	if limit <= 0 {
		limit = 10
	}

	const q = `
		SELECT id, wa_number, role, content, agent_type, created_at
		FROM chat_messages
		WHERE wa_number = $1
		ORDER BY created_at DESC
		LIMIT $2
	`

	rows, err := s.DB.QueryContext(ctx, q, waNumber, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var msgs []ChatMessage
	for rows.Next() {
		var m ChatMessage
		if err := rows.Scan(&m.ID, &m.WANumber, &m.Role, &m.Content, &m.AgentType, &m.CreatedAt); err != nil {
			return nil, err
		}
		msgs = append(msgs, m)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Reverse to get chronological order (oldest first)
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}
	return msgs, nil
}

// GetState returns the structured conversation state for a user.
func (s ChatStore) GetState(ctx context.Context, waNumber string) (*GenealogyState, error) {
	const q = `
		SELECT wa_number, current_person_id, last_referenced_person_id,
		       active_lineage_root_id, comparison_person_id, updated_at
		FROM chat_state
		WHERE wa_number = $1
	`

	var state GenealogyState
	var cur, last, root, comp sql.NullString
	err := s.DB.QueryRowContext(ctx, q, waNumber).Scan(
		&state.WANumber, &cur, &last, &root, &comp, &state.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return &GenealogyState{WANumber: waNumber}, nil
	}
	if err != nil {
		return nil, err
	}

	if cur.Valid {
		state.CurrentPersonID = &cur.String
	}
	if last.Valid {
		state.LastReferencedPersonID = &last.String
	}
	if root.Valid {
		state.ActiveLineageRootID = &root.String
	}
	if comp.Valid {
		state.ComparisonPersonID = &comp.String
	}
	return &state, nil
}

// UpdateState upserts the structured conversation state for a user.
func (s ChatStore) UpdateState(ctx context.Context, state *GenealogyState) error {
	const q = `
		INSERT INTO chat_state (wa_number, current_person_id, last_referenced_person_id, active_lineage_root_id, comparison_person_id, updated_at)
		VALUES ($1, $2, $3, $4, $5, now())
		ON CONFLICT (wa_number)
		DO UPDATE SET
			current_person_id = $2,
			last_referenced_person_id = $3,
			active_lineage_root_id = $4,
			comparison_person_id = $5,
			updated_at = now()
	`
	_, err := s.DB.ExecContext(ctx, q,
		state.WANumber,
		nullStr(state.CurrentPersonID),
		nullStr(state.LastReferencedPersonID),
		nullStr(state.ActiveLineageRootID),
		nullStr(state.ComparisonPersonID),
	)
	return err
}

func nullStr(s *string) any {
	if s == nil || *s == "" {
		return nil
	}
	return *s
}
