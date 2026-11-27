/**
 * Phone tab bar (Step 7.1). Below 640 px the sidebar gives way to five tabs; the last one,
 * More, opens the full navigation drawer. The roadmap fixes the four direct tabs per role.
 */

export type Variant = "student" | "parent";

export type TabKey = "today" | "timetable" | "review" | "inbox" | "live" | "marking" | "more";

export type Tab = { key: TabKey; label: string; href: string | null };

const studentTabs: Tab[] = [
  { key: "today", label: "Today", href: "/today" },
  { key: "timetable", label: "Timetable", href: "/timetable" },
  { key: "review", label: "Review", href: "/review" },
  { key: "inbox", label: "Inbox", href: "/messages" },
  { key: "more", label: "More", href: null },
];

const parentTabs: Tab[] = [
  { key: "live", label: "Live", href: "/parent/live" },
  { key: "inbox", label: "Inbox", href: "/parent/messages" },
  { key: "marking", label: "Marking", href: "/parent/marking-desk" },
  { key: "timetable", label: "Timetable", href: "/parent/timetable" },
  { key: "more", label: "More", href: null },
];

export function tabsFor(variant: Variant): Tab[] {
  return variant === "student" ? studentTabs : parentTabs;
}

/**
 * Which tab is lit for a path. A direct tab owns its route and anything beneath it; every other
 * route belongs to More, so the learner can always see where they are.
 */
export function activeTab(variant: Variant, pathname: string): TabKey {
  const hit = tabsFor(variant).find(
    (tab) => tab.href !== null && (pathname === tab.href || pathname.startsWith(tab.href + "/")),
  );
  return hit ? hit.key : "more";
}
