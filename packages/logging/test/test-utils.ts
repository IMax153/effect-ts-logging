import * as A from "@effect-ts/core/Collections/Immutable/Array"
import type { Chunk } from "@effect-ts/core/Collections/Immutable/Chunk"
import * as C from "@effect-ts/core/Collections/Immutable/Chunk"
import * as HM from "@effect-ts/core/Collections/Immutable/HashMap"
import type { Tuple } from "@effect-ts/core/Collections/Immutable/Tuple"
import * as Tp from "@effect-ts/core/Collections/Immutable/Tuple"
import crypto from "crypto"

import type { LogContext } from "../src/LogContext"

// -----------------------------------------------------------------------------
// Generators
// -----------------------------------------------------------------------------

export function mockUUID(): string {
  // Mock generation of a UUID
  return crypto.randomBytes(16).toString("hex")
}

// -----------------------------------------------------------------------------
// Matchers
// -----------------------------------------------------------------------------

function getEquatableLogContext(context: LogContext) {
  return HM.reduceWithIndex_(context.hashMap, A.emptyOf<any>(), (acc, key, value) =>
    A.snoc_(acc, {
      name: key.name,
      initialValue: key.initialValue,
      value
    })
  )
}

export function equalLines(
  a: Chunk<Tuple<[LogContext, string]>>,
  b: Chunk<Tuple<[LogContext, string]>>
): void {
  const linesA = C.toArray(C.map_(a, Tp.update(0, getEquatableLogContext)))
  const linesB = C.toArray(C.map_(b, Tp.update(0, getEquatableLogContext)))

  expect(linesA).toEqual(linesB)
}
