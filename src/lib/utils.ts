import { UserRole } from "@prisma/client";

export const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: "Owner",
  GENERAL_MANAGER: "General Manager",
  FRONT_DESK: "Front Desk",
  EXECUTIVE_HOUSEKEEPER: "Executive Housekeeper",
  HOUSEKEEPER: "Housekeeper",
  MAINTENANCE: "Maintenance",
  INSPECTOR: "Inspector",
};

export const ROOM_STATUS_CONFIG = {
  VACANT_DIRTY: { label: "Dirty", color: "bg-red-500", text: "text-red-700", bg: "bg-red-50", emoji: "🟥" },
  CLEANING: { label: "Cleaning", color: "bg-yellow-500", text: "text-yellow-700", bg: "bg-yellow-50", emoji: "🟨" },
  VACANT_CLEAN: { label: "Clean", color: "bg-green-500", text: "text-green-700", bg: "bg-green-50", emoji: "🟩" },
  INSPECTED: { label: "Inspected", color: "bg-blue-500", text: "text-blue-700", bg: "bg-blue-50", emoji: "🟦" },
  OCCUPIED: { label: "Occupied", color: "bg-slate-400", text: "text-slate-700", bg: "bg-slate-50", emoji: "⚪" },
  MAINTENANCE: { label: "Maintenance", color: "bg-purple-500", text: "text-purple-700", bg: "bg-purple-50", emoji: "🟪" },
  OUT_OF_ORDER: { label: "Out of Order", color: "bg-gray-800", text: "text-gray-700", bg: "bg-gray-100", emoji: "⚫" },
  OUT_OF_INVENTORY: { label: "Out of Inventory", color: "bg-stone-700", text: "text-stone-800", bg: "bg-stone-100", emoji: "🚫" },
} as const;

export const GUEST_STAY_CONFIG = {
  VACANT: { label: "Vacant", className: "bg-slate-100 text-slate-700" },
  OCCUPIED: { label: "Stayover", className: "bg-indigo-100 text-indigo-800" },
  DEPARTING: { label: "Departing", className: "bg-orange-100 text-orange-800" },
  STAYOVER: { label: "Stayover", className: "bg-indigo-100 text-indigo-800" },
  ARRIVING: { label: "Arriving", className: "bg-sky-100 text-sky-800" },
  CHECKED_OUT: { label: "Checked out", className: "bg-rose-100 text-rose-800" },
  MAINTENANCE: { label: "Maintenance", className: "bg-purple-100 text-purple-800" },
} as const;

/** What housekeeping should read: stayover, departing, or checked out. */
export function guestStayLabel(guestStatus: keyof typeof GUEST_STAY_CONFIG, roomStatus?: string) {
  if (guestStatus === "DEPARTING") return GUEST_STAY_CONFIG.DEPARTING;
  if (guestStatus === "ARRIVING") return GUEST_STAY_CONFIG.ARRIVING;
  if (guestStatus === "MAINTENANCE") return GUEST_STAY_CONFIG.MAINTENANCE;
  if (guestStatus === "CHECKED_OUT") return GUEST_STAY_CONFIG.CHECKED_OUT;
  if (guestStatus === "STAYOVER" || guestStatus === "OCCUPIED" || roomStatus === "OCCUPIED") {
    return GUEST_STAY_CONFIG.STAYOVER;
  }
  if (roomStatus === "VACANT_DIRTY" || roomStatus === "CLEANING") return GUEST_STAY_CONFIG.CHECKED_OUT;
  return GUEST_STAY_CONFIG.VACANT;
}

export const DEFAULT_CHECKLIST_ITEMS = [
  "Bathroom", "Bed", "Vacuum", "Dust", "Coffee", "Amenities",
  "Trash", "Mirror", "Windows", "Floor", "TV", "AC", "Mini Fridge",
];

export const INSPECTION_CHECKLIST_ITEMS = [
  "Bathroom", "Bed", "Hair", "Dust", "Coffee", "Amenities",
  "Remote", "TV", "AC", "Curtains", "Windows", "Mirror", "Furniture",
];

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", roles: "all" as const },
  { href: "/map", label: "Hotel Map", icon: "Map", roles: "all" as const },
  { href: "/housekeeping", label: "Housekeeping", icon: "Sparkles", roles: [UserRole.HOUSEKEEPER, UserRole.EXECUTIVE_HOUSEKEEPER, UserRole.GENERAL_MANAGER, UserRole.OWNER, UserRole.FRONT_DESK] },
  { href: "/inspection", label: "Inspection", icon: "ClipboardCheck", roles: [UserRole.INSPECTOR, UserRole.EXECUTIVE_HOUSEKEEPER, UserRole.GENERAL_MANAGER, UserRole.OWNER] },
  { href: "/maintenance", label: "Maintenance", icon: "Wrench", roles: [UserRole.MAINTENANCE, UserRole.GENERAL_MANAGER, UserRole.OWNER, UserRole.FRONT_DESK] },
  { href: "/front-desk", label: "Front Desk", icon: "ConciergeBell", roles: [UserRole.FRONT_DESK, UserRole.GENERAL_MANAGER, UserRole.OWNER] },
  { href: "/guest-requests", label: "Guest Requests", icon: "Bell", roles: [UserRole.HOUSEKEEPER, UserRole.EXECUTIVE_HOUSEKEEPER, UserRole.FRONT_DESK, UserRole.GENERAL_MANAGER, UserRole.OWNER] },
  { href: "/inventory", label: "Inventory", icon: "Package", roles: [UserRole.EXECUTIVE_HOUSEKEEPER, UserRole.GENERAL_MANAGER, UserRole.OWNER] },
  { href: "/laundry", label: "Laundry", icon: "Shirt", roles: [UserRole.EXECUTIVE_HOUSEKEEPER, UserRole.HOUSEKEEPER, UserRole.GENERAL_MANAGER, UserRole.OWNER] },
  { href: "/lost-found", label: "Lost & Found", icon: "Search", roles: [UserRole.HOUSEKEEPER, UserRole.FRONT_DESK, UserRole.EXECUTIVE_HOUSEKEEPER, UserRole.GENERAL_MANAGER, UserRole.OWNER] },
  { href: "/reports", label: "Reports", icon: "BarChart3", roles: [UserRole.OWNER, UserRole.GENERAL_MANAGER, UserRole.EXECUTIVE_HOUSEKEEPER] },
  { href: "/ai", label: "AI Assistant", icon: "Bot", roles: [UserRole.OWNER, UserRole.GENERAL_MANAGER, UserRole.EXECUTIVE_HOUSEKEEPER, UserRole.FRONT_DESK] },
  { href: "/upload", label: "HK Report Import", icon: "Upload", roles: [UserRole.OWNER, UserRole.GENERAL_MANAGER, UserRole.EXECUTIVE_HOUSEKEEPER, UserRole.FRONT_DESK] },
  { href: "/pms", label: "PMS Connectors", icon: "Plug", roles: [UserRole.OWNER, UserRole.GENERAL_MANAGER] },
  { href: "/m", label: "Mobile App", icon: "Smartphone", roles: "all" as const },
  { href: "/messages", label: "Messages", icon: "MessageSquare", roles: "all" as const },
  { href: "/account", label: "Account", icon: "KeyRound", roles: "all" as const },
  { href: "/staff", label: "Add Staff", icon: "UserPlus", roles: [UserRole.OWNER, UserRole.GENERAL_MANAGER] },
  { href: "/settings", label: "Settings", icon: "Settings", roles: [UserRole.OWNER, UserRole.GENERAL_MANAGER] },
];

export function getStockAlert(quantity: number, reorderThreshold: number, criticalThreshold: number) {
  if (quantity <= criticalThreshold) return { level: "CRITICAL" as const, label: "Critical Stock", color: "bg-red-100 text-red-800" };
  if (quantity <= reorderThreshold) return { level: "LOW" as const, label: "Low Stock", color: "bg-yellow-100 text-yellow-800" };
  if (quantity <= reorderThreshold * 1.25) return { level: "REORDER" as const, label: "Need Reorder", color: "bg-orange-100 text-orange-800" };
  return { level: "OK" as const, label: "OK", color: "bg-green-100 text-green-800" };
}

export function canAccessNav(role: UserRole, navRoles: "all" | UserRole[]): boolean {
  if (navRoles === "all") return true;
  return navRoles.includes(role);
}

const ASSIGN_HOUSEKEEPER_ROLES: UserRole[] = [
  UserRole.OWNER,
  UserRole.GENERAL_MANAGER,
  UserRole.EXECUTIVE_HOUSEKEEPER,
  UserRole.FRONT_DESK,
];

export function canAssignHousekeepers(role: UserRole) {
  return ASSIGN_HOUSEKEEPER_ROLES.includes(role);
}

export function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}
