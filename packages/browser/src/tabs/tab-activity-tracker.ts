/**
 * Tab Activity Tracker
 *
 * Monitors and tracks activity across browser tabs.
 * Handles multi-tab scenarios and tab state management.
 */

import type { Page, BrowserContext } from "playwright";

export interface TabActivityConfig {
  /** Track tab URLs */
  trackUrls: boolean;
  /** Track tab titles */
  trackTitles: boolean;
  /** Track tab lifecycle */
  trackLifecycle: boolean;
  /** Track tab focus/blur */
  trackFocus: boolean;
  /** Max tabs to track */
  maxTabs: number;
  /** Auto-close inactive tabs after (ms) */
  inactiveTimeout: number;
  /** On tab activity change */
  onActivityChange?: (activity: TabActivity) => void;
  /** On new tab opened */
  onTabOpened?: (tab: TabInfo) => void;
  /** On tab closed */
  onTabClosed?: (tab: TabInfo) => void;
}

export interface TabInfo {
  id: string;
  url: string;
  title: string;
  status: TabStatus;
  openedAt: number;
  lastActiveAt: number;
  activityCount: number;
  isActive: boolean;
  openerTabId?: string;
  metadata: {
    width?: number;
    height?: number;
    deviceScaleFactor?: number;
  };
}

export type TabStatus = "loading" | "interactive" | "complete" | "closed";

export interface TabActivity {
  tabId: string;
  type: ActivityType;
  timestamp: number;
  data?: unknown;
}

export type ActivityType =
  | "navigate"
  | "reload"
  | "focus"
  | "blur"
  | "close"
  | "open"
  | "title-change"
  | "url-change"
  | "user-action";

export interface TabSnapshot {
  tabs: TabInfo[];
  activeTabId: string | null;
  tabCount: number;
  timestamp: number;
}

export interface TabGroup {
  name: string;
  tabIds: string[];
  color?: string;
}

export const DEFAULT_TAB_ACTIVITY_CONFIG: TabActivityConfig = {
  trackUrls: true,
  trackTitles: true,
  trackLifecycle: true,
  trackFocus: true,
  maxTabs: 20,
  inactiveTimeout: 0, // 0 = don't auto-close
};

/**
 * Tab Activity Tracker
 *
 * Manages and tracks browser tab activity for multi-tab scenarios.
 */
export class TabActivityTracker {
  private config: TabActivityConfig;
  private tabs = new Map<string, TabInfo>();
  private activities: TabActivity[] = [];
  private activeTabId: string | null = null;
  private context?: BrowserContext;
  private pageToTabId = new Map<Page, string>();
  private cleanupInterval?: NodeJS.Timeout;

  constructor(config: Partial<TabActivityConfig> = {}) {
    this.config = { ...DEFAULT_TAB_ACTIVITY_CONFIG, ...config };
  }

  /**
   * Start tracking tabs in context
   */
  async startTracking(context: BrowserContext): Promise<void> {
    this.context = context;

    // Track existing pages
    const pages = context.pages();
    for (let i = 0; i < pages.length; i++) {
      await this.trackPage(pages[i], i === 0);
    }

    // Listen for new pages
    context.on("page", (page) => this.trackPage(page, false));

    // Start cleanup loop
    if (this.config.inactiveTimeout > 0) {
      this.cleanupInterval = setInterval(() => {
        this.cleanupInactiveTabs();
      }, 60000);
    }
  }

  /**
   * Track a specific page
   */
  private async trackPage(page: Page, isActive: boolean): Promise<TabInfo> {
    const tabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const tab: TabInfo = {
      id: tabId,
      url: page.url(),
      title: await page.title().catch(() => ""),
      status: "loading",
      openedAt: Date.now(),
      lastActiveAt: Date.now(),
      activityCount: 0,
      isActive,
      metadata: {},
    };

    this.tabs.set(tabId, tab);
    this.pageToTabId.set(page, tabId);

    if (isActive) {
      this.activeTabId = tabId;
    }

    // Set up page listeners
    this.setupPageListeners(page, tabId);

    this.config.onTabOpened?.(tab);
    this.recordActivity(tabId, "open");

    return tab;
  }

  /**
   * Set up listeners for page events
   */
  private setupPageListeners(page: Page, tabId: string): void {
    // URL changes
    page.on("framenavigated", async (frame) => {
      if (frame === page.mainFrame()) {
        const tab = this.tabs.get(tabId);
        if (tab) {
          tab.url = frame.url();
          tab.lastActiveAt = Date.now();
          tab.activityCount++;
          this.recordActivity(tabId, "url-change", { url: tab.url });
        }
      }
    });

    // Title changes (via polling since Playwright doesn't expose this directly)
    const checkTitle = async () => {
      const tab = this.tabs.get(tabId);
      if (!tab || tab.status === "closed") return;

      try {
        const newTitle = await page.title();
        if (newTitle !== tab.title) {
          tab.title = newTitle;
          tab.lastActiveAt = Date.now();
          this.recordActivity(tabId, "title-change", { title: newTitle });
        }
      } catch {
        // Page might be closed
      }
    };

    const titleInterval = setInterval(checkTitle, 1000);

    // Lifecycle events
    page.on("load", () => {
      const tab = this.tabs.get(tabId);
      if (tab) {
        tab.status = "complete";
        this.recordActivity(tabId, "navigate", { status: "complete" });
      }
    });

    page.on("domcontentloaded", () => {
      const tab = this.tabs.get(tabId);
      if (tab) {
        tab.status = "interactive";
      }
    });

    page.on("close", () => {
      this.handleTabClose(tabId);
      clearInterval(titleInterval);
    });

    // Track clicks and user actions
    page.on("request", (request) => {
      if (request.isNavigationRequest()) {
        const tab = this.tabs.get(tabId);
        if (tab) {
          tab.activityCount++;
          tab.lastActiveAt = Date.now();
        }
      }
    });
  }

  /**
   * Handle tab close
   */
  private handleTabClose(tabId: string): void {
    const tab = this.tabs.get(tabId);
    if (!tab) return;

    tab.status = "closed";
    this.recordActivity(tabId, "close");
    this.config.onTabClosed?.(tab);

    // Clean up after a delay
    setTimeout(() => {
      this.tabs.delete(tabId);

      // Find and remove from page mapping
      for (const [page, id] of this.pageToTabId) {
        if (id === tabId) {
          this.pageToTabId.delete(page);
          break;
        }
      }

      // Update active tab if needed
      if (this.activeTabId === tabId) {
        this.activeTabId = this.findMostRecentTab()?.id || null;
      }
    }, 5000);
  }

  /**
   * Set active tab
   */
  setActiveTab(tabId: string): boolean {
    const tab = this.tabs.get(tabId);
    if (!tab || tab.status === "closed") return false;

    // Deactivate current
    if (this.activeTabId) {
      const current = this.tabs.get(this.activeTabId);
      if (current) {
        current.isActive = false;
        this.recordActivity(this.activeTabId, "blur");
      }
    }

    // Activate new
    tab.isActive = true;
    tab.lastActiveAt = Date.now();
    this.activeTabId = tabId;
    this.recordActivity(tabId, "focus");

    return true;
  }

  /**
   * Find most recent active tab
   */
  private findMostRecentTab(): TabInfo | null {
    let mostRecent: TabInfo | null = null;

    for (const tab of this.tabs.values()) {
      if (tab.status !== "closed") {
        if (!mostRecent || tab.lastActiveAt > mostRecent.lastActiveAt) {
          mostRecent = tab;
        }
      }
    }

    return mostRecent;
  }

  /**
   * Record activity
   */
  private recordActivity(tabId: string, type: ActivityType, data?: unknown): void {
    const activity: TabActivity = {
      tabId,
      type,
      timestamp: Date.now(),
      data,
    };

    this.activities.push(activity);
    this.config.onActivityChange?.(activity);
  }

  /**
   * Clean up inactive tabs
   */
  private cleanupInactiveTabs(): void {
    if (this.config.inactiveTimeout <= 0) return;

    const cutoff = Date.now() - this.config.inactiveTimeout;

    for (const [tabId, tab] of this.tabs) {
      if (tab.status !== "closed" && !tab.isActive && tab.lastActiveAt < cutoff) {
        // Close the actual page
        for (const [page, id] of this.pageToTabId) {
          if (id === tabId) {
            page.close().catch(() => {});
            break;
          }
        }
      }
    }
  }

  /**
   * Get tab by ID
   */
  getTab(tabId: string): TabInfo | undefined {
    return this.tabs.get(tabId);
  }

  /**
   * Get tab ID for page
   */
  getTabIdForPage(page: Page): string | undefined {
    return this.pageToTabId.get(page);
  }

  /**
   * Get page for tab ID
   */
  getPageForTabId(tabId: string): Page | undefined {
    for (const [page, id] of this.pageToTabId) {
      if (id === tabId) return page;
    }
    return undefined;
  }

  /**
   * Get all tabs
   */
  getAllTabs(): TabInfo[] {
    return Array.from(this.tabs.values()).filter((t) => t.status !== "closed");
  }

  /**
   * Get active tab
   */
  getActiveTab(): TabInfo | null {
    return this.activeTabId ? this.tabs.get(this.activeTabId) || null : null;
  }

  /**
   * Get tab activities
   */
  getTabActivities(tabId?: string): TabActivity[] {
    if (tabId) {
      return this.activities.filter((a) => a.tabId === tabId);
    }
    return [...this.activities];
  }

  /**
   * Get tab statistics
   */
  getTabStats(tabId: string): {
    totalActivities: number;
    timeActive: number;
    navigations: number;
    userActions: number;
  } | null {
    const tab = this.tabs.get(tabId);
    if (!tab) return null;

    const tabActivities = this.activities.filter((a) => a.tabId === tabId);

    return {
      totalActivities: tabActivities.length,
      timeActive: Date.now() - tab.openedAt,
      navigations: tabActivities.filter((a) => a.type === "navigate").length,
      userActions: tab.activityCount,
    };
  }

  /**
   * Create snapshot
   */
  createSnapshot(): TabSnapshot {
    return {
      tabs: this.getAllTabs(),
      activeTabId: this.activeTabId,
      tabCount: this.tabs.size,
      timestamp: Date.now(),
    };
  }

  /**
   * Group tabs by pattern
   */
  groupTabs(patterns: Record<string, RegExp>): TabGroup[] {
    const groups: TabGroup[] = [];

    for (const [name, regex] of Object.entries(patterns)) {
      const tabIds: string[] = [];

      for (const tab of this.tabs.values()) {
        if (regex.test(tab.url) || regex.test(tab.title)) {
          tabIds.push(tab.id);
        }
      }

      if (tabIds.length > 0) {
        groups.push({ name, tabIds });
      }
    }

    return groups;
  }

  /**
   * Close tab
   */
  async closeTab(tabId: string): Promise<boolean> {
    const page = this.getPageForTabId(tabId);
    if (!page) return false;

    await page.close();
    return true;
  }

  /**
   * Close all tabs except
   */
  async closeAllExcept(tabId: string): Promise<void> {
    for (const [id, tab] of this.tabs) {
      if (id !== tabId && tab.status !== "closed") {
        await this.closeTab(id);
      }
    }
  }

  /**
   * Stop tracking
   */
  stopTracking(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.tabs.clear();
    this.pageToTabId.clear();
    this.activities = [];
    this.context = undefined;
  }
}

/**
 * Convenience function
 */
export function createTabActivityTracker(config?: Partial<TabActivityConfig>): TabActivityTracker {
  return new TabActivityTracker(config);
}
