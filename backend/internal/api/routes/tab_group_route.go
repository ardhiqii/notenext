package routes

import (
	"github.com/ardhiqii/notenext/backend/internal/api/handlers"
	"github.com/gin-gonic/gin"
)

func RegisterTabGroupRoutes(route *gin.RouterGroup, authMiddleware gin.HandlerFunc, groupHandler *handlers.TabGroupHandler) {

	groups := route.Group("/groups")
	{
		groups.POST("", authMiddleware, groupHandler.Create)
		groups.GET("", authMiddleware, groupHandler.GetAllWithTabs)

		// Static routes before :id to avoid route conflicts
		groups.PATCH("/reorder", authMiddleware, groupHandler.Reorder)

		// Per-group operations
		groups.GET("/:id", authMiddleware, groupHandler.GetByID)
		groups.PATCH("/:id", authMiddleware, groupHandler.Rename)
		groups.DELETE("/:id", authMiddleware, groupHandler.Delete)
		groups.PATCH("/:id/collapse", authMiddleware, groupHandler.ToggleCollapse)

		// Nested: reorder tabs within a group
		groups.PATCH("/:id/tabs/reorder", authMiddleware, groupHandler.ReorderTabsInGroup)
	}

	// Tab-to-group assignment (separate from notes CRUD)
	tabs := route.Group("/tabs")
	{
		tabs.PATCH("/:tabId/group", authMiddleware, groupHandler.AssignGroup)
	}
}
