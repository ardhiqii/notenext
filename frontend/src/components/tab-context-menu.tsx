import { cn } from "@/lib/utils";
import type { Note, TabGroupWithTabs } from "@/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Check, FolderInput, FolderPlus, X } from "lucide-react";
import { useRef, useState } from "react";

interface TabContextMenuProps {
  tab: Note;
  groups: TabGroupWithTabs[];
  isOpen: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onCreateGroup: (name: string, tabId: string) => void;
  onAssignToGroup: (tabId: string, groupId: string) => void;
  onRemoveFromGroup: (tabId: string) => void;
}

const TabContextMenu = ({
  tab,
  groups,
  isOpen,
  position,
  onClose,
  onCreateGroup,
  onAssignToGroup,
  onRemoveFromGroup,
}: TabContextMenuProps) => {
  const [isCreating, setIsCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) {
      setIsCreating(false);
      return;
    }
    onCreateGroup(newGroupName.trim(), tab.id);
    setIsCreating(false);
    setNewGroupName("");
  };

  const handleCreateClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isCreating) {
      setIsCreating(true);
      // Auto-focus on next tick
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DropdownMenuTrigger asChild>
        <div
          style={{
            position: "fixed",
            left: position.x,
            top: position.y,
            width: 0,
            height: 0,
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {/* Create New Group: when editing, render a plain input block
            (NOT inside DropdownMenuItem — Radix items block pointer focus,
            so an input inside an item can never be typed into) */}
        {isCreating ? (
          <div className="px-2 py-1.5">
            <input
              ref={inputRef}
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.stopPropagation();
                  handleCreateGroup();
                } else if (e.key === "Escape") {
                  e.stopPropagation();
                  setIsCreating(false);
                  setNewGroupName("");
                }
              }}
              onBlur={handleCreateGroup}
              placeholder="Group name..."
              className={cn(
                "text-xs bg-background border rounded px-1.5 py-0.5 outline-none w-40",
              )}
            />
          </div>
        ) : (
          <>
            <DropdownMenuItem
              onSelect={(e) => e.preventDefault()}
              onClick={handleCreateClick}
            >
              <FolderPlus className="w-4 h-4" />
              <span>Create New Group</span>
            </DropdownMenuItem>

            {/* Move to group submenu */}
            {groups.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <FolderInput className="w-4 h-4" />
                  <span>Move to group</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {groups.map((group) => (
                    <DropdownMenuItem
                      key={group.id}
                      onClick={() => onAssignToGroup(tab.id, group.id)}
                    >
                      <span>{group.name}</span>
                      {tab.groupId === group.id && (
                        <Check className="ml-auto w-3.5 h-3.5" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}

            {/* Remove from group */}
            {tab.groupId != null && (
              <DropdownMenuItem onClick={() => onRemoveFromGroup(tab.id)}>
                <X className="w-4 h-4" />
                <span>Remove from group</span>
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default TabContextMenu;
