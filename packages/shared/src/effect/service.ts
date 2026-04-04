import { Effect, Layer, ServiceMap } from "effect";

export type ServiceMaker<S> = Effect.Effect<S>;

type ServiceConstructor<S> = new () => S & {
  readonly layer: Layer.Layer<S>;
  readonly make: ServiceMaker<S>;
};

export function createService<S>(tag: string, make: ServiceMaker<S>): ServiceConstructor<S> {
  return class extends ServiceMap.Service<S>()(tag, { make }) {
    static layer = Layer.effect(this, this.make);
  } as unknown as ServiceConstructor<S>;
}

export function createTaggedService<S>(): <T extends string>(
  tag: T,
) => (make: ServiceMaker<S>) => ServiceConstructor<S> {
  return <T extends string>(tag: T) =>
    (make: ServiceMaker<S>) =>
      class extends ServiceMap.Service<S>()(tag, { make }) {
        static layer = Layer.effect(this, this.make);
      } as unknown as ServiceConstructor<S>;
}

export type EffectFn<R extends Effect.Effect<unknown, unknown, unknown>> = R;

export function effectFn<
  Args extends Array<unknown>,
  Ret extends Effect.Effect<unknown, unknown, unknown>,
>(_name: string, fn: (...args: Args) => Ret): (...args: Args) => Ret {
  return fn;
}
