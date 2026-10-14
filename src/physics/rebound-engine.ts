import type {
  BodyInitialState,
  SimulationInitialState,
  SimulationState,
} from "./contracts";
import { simulationInitialStateSchema } from "./contracts";
import type { ReboundModule } from "./wasm/rebound-module";

const MASS = 0;
const X = 1;
const Y = 2;
const Z = 3;
const VX = 4;
const VY = 5;
const VZ = 6;

export class ReboundEngine {
  readonly #module: ReboundModule;
  #bodyIds: string[] = [];
  // REBOUND starts every simulation at its own time zero. Gravity does not
  // depend on absolute time, so a restored state runs from REBOUND time zero
  // and this origin maps REBOUND time back to simulation time.
  #timeOriginSeconds = 0;

  public constructor(module: ReboundModule) {
    this.#module = module;
  }

  public initialize(
    untrustedInitialState: SimulationInitialState,
  ): SimulationState {
    const initialState = simulationInitialStateSchema.parse(
      untrustedInitialState,
    );
    this.#create(initialState.bodies, 0);
    this.#assertSuccess(
      this.#module._sste_move_to_barycentre(),
      "move to barycentre",
    );
    return this.readState();
  }

  // Restarts the integration from a state this engine computed earlier, so a
  // repeated seek to the same time does not integrate the whole span again.
  public restore(state: SimulationState): SimulationState {
    if (!Number.isFinite(state.timeSeconds)) {
      throw new Error("Restored simulation time must be finite");
    }
    const { bodies } = simulationInitialStateSchema.parse({
      bodies: state.bodies,
    });
    this.#create(bodies, state.timeSeconds);
    return this.readState();
  }

  public integrateTo(timeSeconds: number): SimulationState {
    if (!Number.isFinite(timeSeconds)) {
      throw new Error("Integration target time must be finite");
    }
    this.#assertSuccess(
      this.#module._sste_integrate(timeSeconds - this.#timeOriginSeconds),
      "integrate simulation",
    );
    return this.readState();
  }

  public readState(): SimulationState {
    const count = this.#module._sste_body_count();
    if (count !== this.#bodyIds.length) {
      throw new Error(
        `Physics body count ${String(count)} does not match identifier count ${String(this.#bodyIds.length)}`,
      );
    }
    const bodies = this.#bodyIds.map((id, bodyIndex) => ({
      id,
      gravitationalParameterM3S2: this.#readBodyValue(bodyIndex, MASS),
      positionM: [
        this.#readBodyValue(bodyIndex, X),
        this.#readBodyValue(bodyIndex, Y),
        this.#readBodyValue(bodyIndex, Z),
      ] as const,
      velocityMps: [
        this.#readBodyValue(bodyIndex, VX),
        this.#readBodyValue(bodyIndex, VY),
        this.#readBodyValue(bodyIndex, VZ),
      ] as const,
    }));
    const timeSeconds = this.#module._sste_time() + this.#timeOriginSeconds;
    const energy = this.#module._sste_energy();
    if (!Number.isFinite(timeSeconds) || !Number.isFinite(energy)) {
      throw new Error("Physics engine returned non-finite simulation metadata");
    }
    return Object.freeze({
      timeSeconds,
      energy,
      bodies: Object.freeze(bodies),
    });
  }

  #create(
    bodies: readonly BodyInitialState[],
    timeOriginSeconds: number,
  ): void {
    this.#assertSuccess(this.#module._sste_create(1), "create simulation");
    this.#bodyIds = [];
    this.#timeOriginSeconds = timeOriginSeconds;
    for (const body of bodies) {
      this.#addBody(body);
    }
  }

  #addBody(body: BodyInitialState): void {
    const [x, y, z] = body.positionM;
    const [vx, vy, vz] = body.velocityMps;
    this.#assertSuccess(
      this.#module._sste_add_body(
        body.gravitationalParameterM3S2,
        x,
        y,
        z,
        vx,
        vy,
        vz,
      ),
      `add body ${body.id}`,
    );
    this.#bodyIds.push(body.id);
  }

  #readBodyValue(bodyIndex: number, fieldIndex: number): number {
    const value = this.#module._sste_body_value(bodyIndex, fieldIndex);
    if (!Number.isFinite(value)) {
      throw new Error(
        `Physics engine returned non-finite field ${String(fieldIndex)} for body ${String(bodyIndex)}`,
      );
    }
    return value;
  }

  #assertSuccess(code: number, operation: string): void {
    if (code !== 0) {
      throw new Error(
        `Failed to ${operation}: REBOUND bridge error ${String(code)}`,
      );
    }
  }
}
