import { TRANSITION_ROLE_POLICY, canTransition, nextState } from "./transitions";
import type {
  Actor,
  Showing,
  ShowingEvent,
  ShowingOutcome,
  Transition,
} from "./types";

/** Persistence boundary the engine depends on (implemented by the DB layer). */
export interface ShowingStore {
  getShowing(id: string): Promise<Showing | null>;
  insertEvent(event: Omit<ShowingEvent, "id" | "at">): Promise<ShowingEvent>;
  commitShowing(
    id: string,
    expectedVersion: number,
    patch: Partial<Pick<Showing, "state" | "outcome" | "prospectUserId" | "brokerUserId">>,
  ): Promise<Showing | null>;
  /** Returns the original event for an idempotency key, if one exists. */
  getIdempotent?(idempotencyKey: string): Promise<ShowingEvent | null>;
  /**
   * Unit/showing lock (TASK-003). Acquires the exclusive lock for `unitId`
   * on behalf of `showingId`. Returns false when another active workflow
   * already holds the lock — the acquisition must be atomic (e.g. a single
   * INSERT ... ON CONFLICT DO NOTHING) so concurrent CONFIRM attempts
   * cannot both succeed.
   */
  tryAcquireUnitLock?(
    unitId: string,
    showingId: string,
    organizationId: string,
  ): Promise<boolean>;
  /** Releases the lock held by `showingId`, if any. */
  releaseUnitLock?(showingId: string): Promise<void>;
}

export interface TransitionRequest {
  showingId: string;
  transition: Transition;
  actor: Actor;
  idempotencyKey: string;
  /** Required when transition === "RECORD_OUTCOME". */
  outcome?: ShowingOutcome;
  /** Required when transition === "BROKER_ASSIGN". */
  brokerUserId?: string;
}

export type TransitionResult =
  | { ok: true; showing: Showing; event: ShowingEvent; replayed: boolean }
  | { ok: false; code: string; message: string };

let counter = 0;
function newId(prefix: string): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}`;
}

/**
 * The Authoritative Showing Engine.
 *
 * Enforces, in order:
 *  1. Idempotency  — repeated requests with the same key are safe.
 *  2. Existence    — the showing must exist.
 *  3. Tenant isolation — the actor belongs to the showing's organization.
 *  4. Role policy   — the actor's role may initiate this transition.
 *  5. State legality — the transition must be valid from the current state.
 *  6. Concurrency  — optimistic locking prevents double-booking/conflicts;
 *                    CONFIRM additionally acquires the exclusive unit/showing
 *                    lock (released on COMPLETE), so two active workflows can
 *                    never hold the same unit.
 *  7. Audit        — every material transition emits an immutable event.
 */
export class ShowingEngine {
  constructor(private readonly store: ShowingStore) {}

  async transition(req: TransitionRequest): Promise<TransitionResult> {
    const { showingId, transition, actor, idempotencyKey, outcome, brokerUserId } = req;

    // (1) Idempotency: a repeated request replays the original result safely.
    const existing = await this.store.getIdempotent?.(idempotencyKey);
    if (existing) {
      if (existing.showingId !== showingId) {
        return {
          ok: false,
          code: "VALIDATION",
          message: "Idempotency key was already used for a different showing.",
        };
      }
      const showing = await this.store.getShowing(showingId);
      if (showing) {
        return { ok: true, showing, event: existing, replayed: true };
      }
    }

    // (2) Existence.
    const showing = await this.store.getShowing(showingId);
    if (!showing) {
      return { ok: false, code: "NOT_FOUND", message: "Showing not found." };
    }

    // (3) Tenant isolation.
    if (actor.organizationId !== showing.organizationId) {
      return {
        ok: false,
        code: "TENANT_ISOLATION",
        message: "Actor does not belong to the showing's organization.",
      };
    }

    // (4) Role policy.
    const allowedRoles = TRANSITION_ROLE_POLICY[transition];
    if (!allowedRoles.includes(actor.role)) {
      return {
        ok: false,
        code: "ROLE_FORBIDDEN",
        message: `Role '${actor.role}' may not perform '${transition}'.`,
      };
    }

    // (5) State legality.
    if (!canTransition(showing.state, transition)) {
      return {
        ok: false,
        code: "ILLEGAL_TRANSITION",
        message: `Cannot perform '${transition}' from state '${showing.state}'.`,
      };
    }

    // Parameter validation for data-carrying transitions.
    if (transition === "RECORD_OUTCOME" && !outcome) {
      return {
        ok: false,
        code: "VALIDATION",
        message: "An outcome is required for RECORD_OUTCOME.",
      };
    }
    if (transition === "BROKER_ASSIGN" && !brokerUserId) {
      return {
        ok: false,
        code: "VALIDATION",
        message: "A brokerUserId is required for BROKER_ASSIGN.",
      };
    }

    // (6) Concurrency — optimistic lock on version, plus the unit/showing
    // lock: CONFIRM acquires the exclusive lock for the unit so conflicting
    // active workflows cannot both proceed (double-booking protection).
    const to = nextState(showing.state, transition)!;
    let lockAcquired = false;
    if (to === "CONFIRMED") {
      const acquired = await this.store.tryAcquireUnitLock?.(
        showing.unitId,
        showing.id,
        showing.organizationId,
      );
      // A store without lock support (legacy) behaves as "acquired".
      if (acquired === false) {
        return {
          ok: false,
          code: "UNIT_LOCKED",
          message: "Unit is already locked by another active showing workflow.",
        };
      }
      lockAcquired = true;
    }

    const patch: Partial<Pick<Showing, "state" | "outcome" | "prospectUserId" | "brokerUserId">> = {
      state: to,
    };
    if (transition === "RECORD_OUTCOME" && outcome) patch.outcome = outcome;
    if (transition === "PROSPECT_REQUEST") patch.prospectUserId = actor.userId;
    if (transition === "BROKER_ASSIGN" && brokerUserId) patch.brokerUserId = brokerUserId;

    const committed = await this.store.commitShowing(showing.id, showing.version, patch);
    if (!committed) {
      // Never leave an orphan lock behind when the state write loses the race.
      if (lockAcquired) {
        await this.store.releaseUnitLock?.(showing.id);
      }
      return {
        ok: false,
        code: "CONCURRENCY_CONFLICT",
        message: "Concurrent modification detected; retry the request.",
      };
    }

    // Completion releases the unit/showing lock, enabling the outcome step
    // and freeing the unit for future workflows.
    if (transition === "COMPLETE") {
      await this.store.releaseUnitLock?.(showing.id);
    }

    // (7) Audit — immutable event with actor, org, timestamp, state change.
    const event = await this.store.insertEvent({
      showingId: showing.id,
      organizationId: showing.organizationId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      transition,
      fromState: showing.state,
      toState: to,
      idempotencyKey,
    });

    return { ok: true, showing: committed, event, replayed: false };
  }
}
