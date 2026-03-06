package llm

import (
	"strings"

	"github.com/baniakhzab/backend/internal/db"
)

func PathToLabel(path db.RelationPath, targetGender string) string {
	if len(path.Steps) == 0 {
		return "Diri sendiri"
	}

	var ups, downs, laterals int
	hasSpouse := false

	for _, step := range path.Steps {
		switch step.Kind {
		case db.RelationEdgeParent:
			if step.Dir == db.RelationDirToParent {
				ups++
			} else if step.Dir == db.RelationDirToChild {
				downs++
			}
		case db.RelationEdgeSpouse:
			hasSpouse = true
			laterals++
		default:
			laterals++
		}
	}

	g := strings.ToLower(strings.TrimSpace(targetGender))
	isMale := g == "l" || g == "male" || g == "m" || strings.HasPrefix(g, "laki")
	isFemale := g == "p" || g == "female" || g == "f" || strings.HasPrefix(g, "perempuan")

	if ups > 0 && downs == 0 && laterals == 0 {
		switch ups {
		case 1:
			if isMale {
				return "Ayah"
			}
			if isFemale {
				return "Ibu"
			}
			return "Orang tua"
		case 2:
			if isMale {
				return "Kakek"
			}
			if isFemale {
				return "Nenek"
			}
			return "Kakek/Nenek"
		case 3:
			return "Buyut"
		default:
			return "Leluhur"
		}
	}

	if downs > 0 && ups == 0 && laterals == 0 {
		switch downs {
		case 1:
			return "Anak"
		case 2:
			return "Cucu"
		default:
			return "Keturunan"
		}
	}

	if hasSpouse && ups == 0 && downs == 0 {
		return "Pasangan"
	}

	if ups == 1 && laterals >= 1 && downs == 0 {
		if isMale {
			return "Paman"
		}
		if isFemale {
			return "Bibi"
		}
		return "Paman/Bibi"
	}

	if ups == 1 && laterals >= 1 && downs == 1 {
		return "Sepupu"
	}

	if ups == 2 && laterals >= 1 && downs == 0 {
		if isMale {
			return "Paman Buyut"
		}
		if isFemale {
			return "Bibi Buyut"
		}
		return "Paman/Bibi Buyut"
	}

	if ups == 2 && laterals >= 1 && downs == 1 {
		return "Sepupu (derajat 2)"
	}

	return "Kerabat"
}

