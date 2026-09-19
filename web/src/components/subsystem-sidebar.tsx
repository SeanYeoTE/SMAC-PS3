import { TrainFront } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
} from "@/components/ui/sidebar";
import { SUBSYSTEM_ICONS } from "@/lib/subsystem-meta";
import type { SubsystemKey, SubsystemsResponse } from "@/lib/types";

const ORDER: SubsystemKey[] = ["door", "shm", "acv", "rail"];

export function SubsystemSidebar({
  subsystems,
  selected,
  onSelect,
}: {
  subsystems: SubsystemsResponse | null;
  selected: SubsystemKey | null;
  onSelect: (key: SubsystemKey) => void;
}) {
  const isMobile = useIsMobile();

  // The mockup's mobile screens use a bottom tab bar instead of a sidebar drawer
  // (MobileTabBar renders subsystem selection for the "Fleet" tab there instead).
  if (isMobile) return null;

  return (
    <Sidebar collapsible="none">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/30">
            <TrainFront className="size-4 text-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-sidebar-foreground/70">Nebula X</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Subsystems</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu aria-label="Choose a subsystem to check">
              {!subsystems &&
                Array.from({ length: 4 }).map((_, i) => (
                  <SidebarMenuItem key={i}>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                ))}
              {subsystems &&
                ORDER.filter((key) => subsystems[key]).map((key) => {
                  const Icon = SUBSYSTEM_ICONS[key];
                  const isSelected = selected === key;
                  return (
                    <SidebarMenuItem key={key}>
                      <SidebarMenuButton
                        aria-current={isSelected ? "page" : undefined}
                        isActive={isSelected}
                        onClick={() => onSelect(key)}
                      >
                        <Icon aria-hidden="true" />
                        <span>{key.toUpperCase()}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
