package db

import (
	"context"
)

// GetChildren returns all persons who have the given personID as father_id or mother_id.
func (s PersonStore) GetChildren(ctx context.Context, personID string) ([]Person, error) {
	const q = `
		SELECT id, full_name, gender, wa_number, alamat, url, father_id, mother_id, spouse_ids, generation, created_at, updated_at, deleted_at
		FROM persons
		WHERE deleted_at IS NULL
		  AND (father_id = $1 OR mother_id = $1)
		ORDER BY created_at
	`
	return s.queryPersons(ctx, q, personID)
}

// GetSiblings returns all persons who share the same father or mother as the given person (excluding self).
func (s PersonStore) GetSiblings(ctx context.Context, personID string) ([]Person, error) {
	person, err := s.GetByID(ctx, personID)
	if err != nil {
		return nil, err
	}

	if person.FatherID == nil && person.MotherID == nil {
		return nil, nil
	}

	var siblings []Person

	if person.FatherID != nil {
		const q = `
			SELECT id, full_name, gender, wa_number, alamat, url, father_id, mother_id, spouse_ids, generation, created_at, updated_at, deleted_at
			FROM persons
			WHERE deleted_at IS NULL
			  AND father_id = $1
			  AND id != $2
			ORDER BY created_at
		`
		fatherSiblings, err := s.queryPersons(ctx, q, *person.FatherID, personID)
		if err != nil {
			return nil, err
		}
		siblings = append(siblings, fatherSiblings...)
	}

	if person.MotherID != nil {
		const q = `
			SELECT id, full_name, gender, wa_number, alamat, url, father_id, mother_id, spouse_ids, generation, created_at, updated_at, deleted_at
			FROM persons
			WHERE deleted_at IS NULL
			  AND mother_id = $1
			  AND id != $2
		`
		seen := make(map[string]bool)
		for _, s := range siblings {
			seen[s.ID] = true
		}

		motherSiblings, err := s.queryPersons(ctx, q, *person.MotherID, personID)
		if err != nil {
			return nil, err
		}
		for _, ms := range motherSiblings {
			if !seen[ms.ID] {
				siblings = append(siblings, ms)
			}
		}
	}

	return siblings, nil
}

// GetSpouses returns detailed persons for each spouse ID.
func (s PersonStore) GetSpouses(ctx context.Context, personID string) ([]Person, error) {
	person, err := s.GetByID(ctx, personID)
	if err != nil {
		return nil, err
	}
	var spouses []Person
	for _, sid := range person.SpouseIDs {
		sp, err := s.GetByID(ctx, sid)
		if err == nil {
			spouses = append(spouses, *sp)
		}
	}
	return spouses, nil
}

// GetAncestors returns ancestors up to `depth` levels up. Each level is an array of persons.
func (s PersonStore) GetAncestors(ctx context.Context, personID string, depth int) ([][]Person, error) {
	if depth <= 0 {
		depth = 5
	}

	var levels [][]Person
	currentIDs := []string{personID}

	for d := 0; d < depth; d++ {
		var nextIDs []string
		var level []Person

		for _, id := range currentIDs {
			p, err := s.GetByID(ctx, id)
			if err != nil {
				continue
			}
			if p.FatherID != nil {
				father, err := s.GetByID(ctx, *p.FatherID)
				if err == nil {
					level = append(level, *father)
					nextIDs = append(nextIDs, father.ID)
				}
			}
			if p.MotherID != nil {
				mother, err := s.GetByID(ctx, *p.MotherID)
				if err == nil {
					level = append(level, *mother)
					nextIDs = append(nextIDs, mother.ID)
				}
			}
		}

		if len(level) == 0 {
			break
		}
		levels = append(levels, level)
		currentIDs = nextIDs
	}

	return levels, nil
}

// GetDescendants returns descendants up to `depth` levels down. Each level is an array of persons.
func (s PersonStore) GetDescendants(ctx context.Context, personID string, depth int) ([][]Person, error) {
	if depth <= 0 {
		depth = 5
	}

	var levels [][]Person
	currentIDs := []string{personID}

	for d := 0; d < depth; d++ {
		var nextIDs []string
		var level []Person

		for _, id := range currentIDs {
			children, err := s.GetChildren(ctx, id)
			if err != nil {
				continue
			}
			for _, c := range children {
				level = append(level, c)
				nextIDs = append(nextIDs, c.ID)
			}
		}

		if len(level) == 0 {
			break
		}
		levels = append(levels, level)
		currentIDs = nextIDs
	}

	return levels, nil
}

// queryPersons is a helper to execute queries returning person rows.
func (s PersonStore) queryPersons(ctx context.Context, query string, args ...any) ([]Person, error) {
	rows, err := s.DB.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var persons []Person
	for rows.Next() {
		var p Person
		if err := scanPerson(rows, &p); err != nil {
			return nil, err
		}
		persons = append(persons, p)
	}
	return persons, rows.Err()
}
