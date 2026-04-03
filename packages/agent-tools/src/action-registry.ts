import { Schema } from "effect";

export class ActionNotFoundError extends Schema.ErrorClass<ActionNotFoundError>(
  "ActionNotFoundError",
)({
  _tag: Schema.tag("ActionNotFoundError"),
  name: Schema.String,
}) {
  message = `Action not found: ${this.name}`;
}

export class ActionDomainMismatchError extends Schema.ErrorClass<ActionDomainMismatchError>(
  "ActionDomainMismatchError",
)({
  _tag: Schema.tag("ActionDomainMismatchError"),
  action: Schema.String,
  domain: Schema.String,
}) {
  message = `Action "${this.action}" is not available for domain "${this.domain}"`;
}

export interface RegisteredAction {
  name: string;
  description: string;
  domains: string[] | null;
  handler: (...args: unknown[]) => Promise<unknown>;
  paramSchema: object;
}

export interface ActionContext {
  url: string;
  page: unknown;
  sensitiveData: Record<string, string>;
}

export class ActionRegistry {
  private actions: Map<string, RegisteredAction> = new Map();

  register = (action: RegisteredAction): void => {
    this.actions.set(action.name, action);
  };

  unregister = (name: string): void => {
    this.actions.delete(name);
  };

  getForUrl = (url: string): RegisteredAction[] => {
    const parsedUrl = new URL(url);
    const domain = parsedUrl.hostname;

    return Array.from(this.actions.values()).filter((action) => {
      if (action.domains === null) {
        return true;
      }

      return action.domains.some((allowedDomain) => {
        if (allowedDomain.startsWith("*.")) {
          const baseDomain = allowedDomain.slice(2);
          return domain.endsWith(baseDomain);
        }

        return domain === allowedDomain;
      });
    });
  };

  execute = async (
    name: string,
    context: ActionContext,
    params: Record<string, unknown>,
  ): Promise<unknown> => {
    const action = this.actions.get(name);

    if (!action) {
      throw new ActionNotFoundError({ name });
    }

    const parsedUrl = new URL(context.url);
    const domain = parsedUrl.hostname;

    if (action.domains !== null) {
      const domainMatch = action.domains.some((allowedDomain) => {
        if (allowedDomain.startsWith("*.")) {
          const baseDomain = allowedDomain.slice(2);
          return domain.endsWith(baseDomain);
        }

        return domain === allowedDomain;
      });

      if (!domainMatch) {
        throw new ActionDomainMismatchError({ action: name, domain });
      }
    }

    const resolvedParams = this.replaceSensitiveData(JSON.stringify(params), context.sensitiveData);

    const parsedParams = JSON.parse(resolvedParams) as Record<string, unknown>;

    return action.handler(context, parsedParams);
  };

  generateToolSchema = (actions: RegisteredAction[]): object => {
    const tools = actions.map((action) => ({
      type: "function",
      function: {
        name: action.name,
        description: action.description,
        parameters: action.paramSchema,
      },
    }));

    return { tools };
  };

  replaceSensitiveData = (text: string, sensitiveData: Record<string, string>): string => {
    const secretTagRegex = /<secret>([^<]+)<\/secret>/g;

    return text.replace(secretTagRegex, (_match, secretName: string) => {
      const value = sensitiveData[secretName];

      if (value === undefined) {
        return `<secret>${secretName}</secret>`;
      }

      return value;
    });
  };

  getAllActions = (): RegisteredAction[] => {
    return Array.from(this.actions.values());
  };
}
