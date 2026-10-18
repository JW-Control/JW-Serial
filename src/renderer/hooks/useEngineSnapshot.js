import { useSyncExternalStore } from "react";

/** Subscribes a component to the engine's throttled live snapshot. */
export const useEngineSnapshot = (engine) => useSyncExternalStore(engine.subscribe, engine.getSnapshot);
