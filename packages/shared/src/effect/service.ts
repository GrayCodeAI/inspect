import { Effect, Layer, ServiceMap } from "effect";

export type ServiceMaker<S> = Effect.Effect<S>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createService<S>(tag: string, make: ServiceMaker<S>): any {
  return class extends ServiceMap.Service<S>()(tag, { make }) {
    static layer = Layer.effect(this, this.make);
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createTaggedService<S>(): any {
  return <T extends string>(tag: T) =>
    (make: ServiceMaker<S>) =>
      class extends ServiceMap.Service<S>()(tag, { make }) {
        static layer = Layer.effect(this, this.make);
      };
}

export type EffectFn<R extends Effect.Effect<unknown, unknown, unknown>> = R;

export function effectFn<
  Args extends Array<unknown>,
  Ret extends Effect.Effect<unknown, unknown, unknown>,
>(_name: string, fn: (...args: Args) => Ret): (...args: Args) => Ret {
  return fn;
}
