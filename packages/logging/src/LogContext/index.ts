// ets_tracing: off

import * as A from "@effect-ts/core/Collections/Immutable/Array"
import type { HashMap } from "@effect-ts/core/Collections/Immutable/HashMap"
import * as HM from "@effect-ts/core/Collections/Immutable/HashMap"
import * as HS from "@effect-ts/core/Collections/Immutable/HashSet"
import * as O from "@effect-ts/core/Option"

import type { LogAnnotation } from "../LogAnnotation"

// -----------------------------------------------------------------------------
// Model
// -----------------------------------------------------------------------------

/**
 * A `LogContext` stores context associated with logging operations.
 */
export interface LogContext {
  readonly hashMap: HashMap<LogAnnotation<any>, any>
}

// -----------------------------------------------------------------------------
// Constructors
// -----------------------------------------------------------------------------

/**
 * Create a new `LogContext` from a `Map`.
 */
export function make(hashMap: HashMap<LogAnnotation<any>, any>): LogContext {
  return { hashMap }
}

/**
 * Create an empty `LogContext`.
 */
export const empty: LogContext = make(HM.make())

// -----------------------------------------------------------------------------
// Destructors
// -----------------------------------------------------------------------------

/**
 * Renders the value for the specified `LogAnnotation`.
 */
export function apply_<A>(self: LogContext, logAnnotation: LogAnnotation<A>): string {
  return logAnnotation.render(get_(self, logAnnotation))
}

/**
 * Renders the value for the specified `LogAnnotation`.
 *
 * @ets_data_first apply_
 */
export function apply<A>(logAnnotation: LogAnnotation<A>) {
  return (self: LogContext): string => apply_(self, logAnnotation)
}

/**
 * Retrieves the specified annotation from the context.
 */
export function get_<A>(self: LogContext, annotation: LogAnnotation<A>): A {
  return O.getOrElse_(HM.get_(self.hashMap, annotation), () => annotation.initialValue)
}

/**
 * Retrieves the specified annotation from the context.
 *
 * @dataFirst get_
 */
export function get<A>(annotation: LogAnnotation<A>) {
  return (self: LogContext): A => get_(self, annotation)
}

/**
 * Renders all log annotations in current context.
 *
 * @return Map from annotation name to rendered value.
 */
export function renderContext(self: LogContext): HashMap<string, string> {
  return HM.reduceWithIndex_(self.hashMap, HM.make(), (hashMap, annotation, value) =>
    HM.set_(hashMap, annotation.name, annotation.render(value))
  )
}

// -----------------------------------------------------------------------------
// Combinators
// -----------------------------------------------------------------------------

/**
 * Annotates the context with the specified annotation and value, returning
 * the new context.
 */
export function annotate_<A>(
  self: LogContext,
  annotation: LogAnnotation<A>,
  newA: A
): LogContext {
  const oldA = get_(self, annotation)
  return make(HM.set_(self.hashMap, annotation, annotation.combine(oldA, newA)))
}

/**
 * Annotates the context with the specified annotation and value, returning
 * the new context.
 *
 * @dataFirst annotate_
 */
export function annotate<A>(annotation: LogAnnotation<A>, newA: A) {
  return (self: LogContext): LogContext => annotate_(self, annotation, newA)
}

/**
 * Merge this `LogContext` with the specified `LogContext.
 */
export function merge_(self: LogContext, that: LogContext): LogContext {
  const thisKeys = A.from(HS.values(HM.keySet(self.hashMap)))
  const thatKeys = A.from(HS.values(HM.keySet(that.hashMap)))
  const allKeys = A.concat_(thisKeys, thatKeys)

  return make(
    A.reduce_<LogAnnotation<any>, HashMap<LogAnnotation<any>, any>>(
      allKeys,
      HM.make(),
      (hashMap, annotation) => {
        const thisAnnotation = HM.get_(self.hashMap, annotation)
        const thatAnnotation = HM.get_(that.hashMap, annotation)

        if (O.isSome(thisAnnotation) && O.isSome(thatAnnotation)) {
          return HM.set_(
            hashMap,
            annotation,
            annotation.combine(get_(self, annotation), get_(that, annotation))
          )
        } else if (O.isNone(thisAnnotation) && O.isNone(thatAnnotation)) {
          // This branch of execution is not possible
          throw new Error("Bug, unable to location annotations for the LogContext")
        } else if (O.isSome(thisAnnotation)) {
          return HM.set_(hashMap, annotation, get_(self, annotation))
        }
        return HM.set_(hashMap, annotation, get_(that, annotation))
      }
    )
  )
}

/**
 * Merge this `LogContext` with the specified `LogContext.
 *
 * @dataFirst merge_
 */
export function merge(that: LogContext) {
  return (self: LogContext): LogContext => merge_(self, that)
}
