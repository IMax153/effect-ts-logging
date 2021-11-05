// ets_tracing: off

import { Case } from "@effect-ts/core/Case"
import type { Array } from "@effect-ts/core/Collections/Immutable/Array"
import * as A from "@effect-ts/core/Collections/Immutable/Array"
import * as Map from "@effect-ts/core/Collections/Immutable/Map"
import type { Tuple } from "@effect-ts/core/Collections/Immutable/Tuple"
import * as Tp from "@effect-ts/core/Collections/Immutable/Tuple"
import type * as T from "@effect-ts/core/Effect"
import * as STM from "@effect-ts/core/Effect/Transactional/STM"
import * as TRef from "@effect-ts/core/Effect/Transactional/TRef"
import * as IO from "@effect-ts/core/IO"
import * as O from "@effect-ts/core/Option"

import * as LA from "../LogAnnotation"
import type { LogContext } from "../LogContext"
import * as LC from "../LogContext"
import type { LogLevel } from "../LogLevel"
import * as LL from "../LogLevel"

// -----------------------------------------------------------------------------
// Model
// -----------------------------------------------------------------------------

export class LogFilterNode extends Case<{
  readonly logLevel: LogLevel
  readonly children: Map.Map<string, LogFilterNode>
}> {}

export type FilterCache = TRef.TRef<Map.Map<Tuple<[Array<string>, LogLevel]>, boolean>>

// -----------------------------------------------------------------------------
// Operations
// -----------------------------------------------------------------------------

/**
 * Defines a filter function from a list of `LogLevel`s specified per tree node.
 *
 * For example, the following filter will use the `Debug` log level for
 * everything except for log events with the name annotation prefixed by
 * either `["effect-ts", "core"]` or `["effect-ts", "system"]`.
 *
 * ```typescript
 * import * as Tuple from "@effect-ts/core/Collections/Immutable/Tuple"
 * import * as LogLevel from "@effect-ts/logging/LogLevel"
 *
 * const filter = filterBy(LogLevel.Debug, [
 *   Tuple.tuple("effect-ts.core", LogLevel.Info),
 *   Tuple.tuple("effect-ts.system", LogLevel.Info),
 * ])
 * ```
 *
 * @param rootLevel Minimum log level for the root node.
 * @param mappings List of mappings, nesting defined by dot-separated strings.
 * @return A filter function for customizing appenders.
 */
export function filterBy(
  rootLevel: LogLevel,
  ...mappings: Array<Tuple<[string, LogLevel]>>
): <A>(ctx: LogContext, _: A) => boolean {
  return filterByTree(buildLogFilterTree(rootLevel, mappings))
}

export function filterByTree(root: LogFilterNode) {
  return <A>(ctx: LogContext, _: A): boolean => {
    const loggerName = LC.get_(ctx, LA.Name)
    const logLevel = findMostSpecificLogLevel(loggerName, root)
    return LL.gte(LC.get_(ctx, LA.Level), logLevel)
  }
}

export function cachedFilterBy(
  cache: FilterCache,
  rootLevel: LogLevel,
  mappings: Array<Tuple<[string, LogLevel]>>
): <A>(ctx: LogContext, msg: A) => T.UIO<boolean> {
  return cachedFilterByTree(cache, buildLogFilterTree(rootLevel, mappings))
}

export function cachedFilterByTree(cache: FilterCache, root: LogFilterNode) {
  return <A>(ctx: LogContext, _: A): T.UIO<boolean> => {
    const loggerName = LC.get_(ctx, LA.Name)
    const logLevel = LC.get_(ctx, LA.Level)
    const key = Tp.tuple(loggerName, logLevel)
    const stm = STM.gen(function* (_) {
      const map = yield* _(TRef.get(cache))
      const cached = Map.lookup_(map, key)
      return yield* _(
        O.fold_(
          cached,
          () => {
            const mostSpecificLogLevel = findMostSpecificLogLevel(loggerName, root)
            const answer = LL.gte(logLevel, mostSpecificLogLevel)
            return STM.as_(TRef.set_(cache, Map.insert_(map, key, answer)), answer)
          },
          (value) => STM.succeed(value)
        )
      )
    })
    return STM.commit(stm)
  }
}

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------

function add(
  tree: LogFilterNode,
  names: Array<string>,
  logLevel: LogLevel
): LogFilterNode {
  return A.foldLeft_(
    names,
    () => tree.copy({ logLevel }),
    (name, remaining) =>
      O.fold_(
        Map.lookup_(tree.children, name),
        () =>
          tree.copy({
            children: Map.insert_(
              tree.children,
              name,
              add(
                new LogFilterNode({ logLevel: tree.logLevel, children: Map.empty }),
                remaining,
                logLevel
              )
            )
          }),
        (subtree) =>
          tree.copy({
            children: Map.insert_(
              tree.children,
              name,
              add(subtree, remaining, logLevel)
            )
          })
      )
  )
}

function buildLogFilterTree(
  rootLevel: LogLevel,
  mappings: Array<Tuple<[string, LogLevel]>>
): LogFilterNode {
  return A.reduce_(
    mappings,
    new LogFilterNode({ logLevel: rootLevel, children: Map.empty }),
    (tree, { tuple: [name, logLevel] }) => {
      const nameList = name.split(".")
      return add(tree, nameList, logLevel)
    }
  )
}

// @tailrec
// private def findMostSpecificLogLevel(names: List[String], currentNode: LogFilterNode): LogLevel =
//   names match {
//     case next :: remaining =>
//       currentNode.children.get(next) match {
//         case Some(nextNode) =>
//           findMostSpecificLogLevel(remaining, nextNode)
//         case None           =>
//           currentNode.logLevel
//       }
//     case Nil               =>
//       currentNode.logLevel
//   }

function findMostSpecificLogLevelRec(
  names: Array<string>,
  currentNode: LogFilterNode
): IO.IO<LogLevel> {
  return A.foldLeft_(
    names,
    () => IO.succeed(currentNode.logLevel),
    (next, remaining) =>
      O.fold_(
        Map.lookup_(currentNode.children, next),
        () => IO.succeed(currentNode.logLevel),
        (nextNode) => findMostSpecificLogLevelRec(remaining, nextNode)
      )
  )
}

function findMostSpecificLogLevel(
  names: Array<string>,
  currentNode: LogFilterNode
): LogLevel {
  return IO.run(findMostSpecificLogLevelRec(names, currentNode))
}
