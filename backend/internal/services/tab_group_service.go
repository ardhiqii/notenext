package services

import (
	"context"

	"github.com/ardhiqii/notenext/backend/internal/dtos"
	"github.com/ardhiqii/notenext/backend/internal/entities"
	"github.com/ardhiqii/notenext/backend/internal/repositories"
)

type TabGroupService struct {
	groupRepo repositories.TabGroupRepoInterface
}

func NewTabGroupService(groupRepo repositories.TabGroupRepoInterface) *TabGroupService {
	return &TabGroupService{groupRepo: groupRepo}
}

func (s *TabGroupService) Create(ctx context.Context, userID string, req *dtos.CreateTabGroupRequest) (*dtos.TabGroupResponse, error) {
	group, err := s.groupRepo.Create(ctx, userID, req.Name)
	if err != nil {
		return nil, err
	}
	return &dtos.TabGroupResponse{
		ID:         group.ID,
		Name:       group.Name,
		PositionAt: group.PositionAt,
		Collapsed:  false,
		CreatedAt:  group.CreatedAt,
		UpdatedAt:  group.UpdatedAt,
	}, nil
}

func (s *TabGroupService) GetAllWithTabs(ctx context.Context, userID string) (*dtos.TabsWithGroupsResponse, error) {
	groups, notes, err := s.groupRepo.GetAllWithTabs(ctx, userID)
	if err != nil {
		return nil, err
	}

	// Build group map for fast lookup
	groupTabs := make(map[string][]dtos.TabResponse)
	for _, g := range groups {
		groupTabs[g.ID] = make([]dtos.TabResponse, 0)
	}

	ungroupedTabs := make([]dtos.TabResponse, 0)
	for _, n := range notes {
		tab := dtos.TabResponse{
			ID:         n.ID,
			Title:      n.Title,
			PositionAt: n.PositionAt,
			GroupID:    n.GroupID,
		}
		if n.GroupID != nil {
			groupTabs[*n.GroupID] = append(groupTabs[*n.GroupID], tab)
		} else {
			ungroupedTabs = append(ungroupedTabs, tab)
		}
	}

	groupResponses := make([]dtos.TabGroupWithTabsResponse, 0, len(groups))
	for _, g := range groups {
		groupResponses = append(groupResponses, dtos.TabGroupWithTabsResponse{
			ID:         g.ID,
			Name:       g.Name,
			PositionAt: g.PositionAt,
			Collapsed:  g.Collapsed,
			Tabs:       groupTabs[g.ID],
			CreatedAt:  g.CreatedAt,
			UpdatedAt:  g.UpdatedAt,
		})
	}

	return &dtos.TabsWithGroupsResponse{
		Groups:        groupResponses,
		UngroupedTabs: ungroupedTabs,
	}, nil
}

func (s *TabGroupService) GetByID(ctx context.Context, userID, id string) (*entities.TabGroup, error) {
	return s.groupRepo.GetByID(ctx, userID, id)
}

func (s *TabGroupService) Rename(ctx context.Context, userID, id, name string) error {
	return s.groupRepo.UpdateName(ctx, userID, id, name)
}

func (s *TabGroupService) Delete(ctx context.Context, userID, id string) error {
	return s.groupRepo.Delete(ctx, userID, id)
}

func (s *TabGroupService) Reorder(ctx context.Context, userID string, groupIDs []string) error {
	return s.groupRepo.Reorder(ctx, userID, groupIDs)
}

func (s *TabGroupService) ToggleCollapse(ctx context.Context, userID, id string, collapsed bool) error {
	return s.groupRepo.ToggleCollapse(ctx, userID, id, collapsed)
}
