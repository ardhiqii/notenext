package dtos

// --- Requests ---

type CreateTabGroupRequest struct {
	Name string `json:"name" binding:"required"`
}

type RenameTabGroupRequest struct {
	Name string `json:"name" binding:"required"`
}

type ReorderGroupsRequest struct {
	GroupIDs []string `json:"group_ids" binding:"required"`
}

type ToggleCollapseRequest struct {
	Collapsed bool `json:"collapsed"`
}

type AssignGroupRequest struct {
	GroupID *string `json:"group_id"`
}

type ReorderTabsInGroupRequest struct {
	TabIDs []string `json:"tab_ids" binding:"required"`
}

type TabGroupIDParam struct {
	ID string `uri:"id" binding:"required"`
}

type TabGroupAssignParam struct {
	TabID string `uri:"tabId" binding:"required"`
}

type TabGroupReorderParam struct {
	GroupID string `uri:"groupId" binding:"required"`
}

// --- Responses ---

type TabGroupResponse struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	PositionAt int64  `json:"position_at"`
	Collapsed  bool   `json:"collapsed"`
	CreatedAt  string `json:"created_at"`
	UpdatedAt  string `json:"updated_at"`
}

type TabGroupWithTabsResponse struct {
	ID         string        `json:"id"`
	Name       string        `json:"name"`
	PositionAt int64         `json:"position_at"`
	Collapsed  bool          `json:"collapsed"`
	Tabs       []TabResponse `json:"tabs"`
	CreatedAt  string        `json:"created_at"`
	UpdatedAt  string        `json:"updated_at"`
}

type TabsWithGroupsResponse struct {
	Groups       []TabGroupWithTabsResponse `json:"groups"`
	UngroupedTabs []TabResponse              `json:"ungrouped_tabs"`
}
