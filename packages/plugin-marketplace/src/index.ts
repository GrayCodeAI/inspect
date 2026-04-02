// Plugin Marketplace Foundation
export interface Plugin {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly author: string;
  readonly entryPoint: string;
  readonly hooks: PluginHook[];
}

export interface PluginHook {
  readonly event: string;
  readonly handler: string;
}

export class PluginRegistry {
  private plugins: Map<string, Plugin> = new Map();
  private hooks: Map<string, ((data: unknown) => void)[]> = new Map();

  register(plugin: Plugin): void {
    this.plugins.set(plugin.id, plugin);

    for (const hook of plugin.hooks) {
      const existing = this.hooks.get(hook.event) ?? [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      existing.push((data: any) => {
        console.log(`Executing hook ${hook.handler} for event ${hook.event}`, data);
      });
      this.hooks.set(hook.event, existing);
    }
  }

  unregister(pluginId: string): void {
    this.plugins.delete(pluginId);
  }

  getPlugin(pluginId: string): Plugin | undefined {
    return this.plugins.get(pluginId);
  }

  getAllPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  emit(event: string, data: unknown): void {
    const handlers = this.hooks.get(event) ?? [];
    for (const handler of handlers) {
      handler(data);
    }
  }
}

export const pluginRegistry = new PluginRegistry();
