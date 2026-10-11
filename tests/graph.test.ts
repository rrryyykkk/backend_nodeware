/**
 * tests/graph.test.ts
 * Unit tests: Cycle Detection (UT-02, TC-DEP-04..06)
 */
import { describe, expect, test } from "bun:test";
import { detectCycle } from "../src/utils/graph";

describe("Graph Cycle Detection (UT-02, TC-DEP-04..06)", () => {
  test("mendeteksi self-dependency", () => {
    const cycle = detectCycle([], { from: "t1", to: "t1" });
    expect(cycle).toEqual(["t1", "t1"]);
  });

  test("mendeteksi siklus 2 node (A -> B lalu B -> A)", () => {
    const edges = [{ from: "t1", to: "t2" }];
    const cycle = detectCycle(edges, { from: "t2", to: "t1" });
    expect(cycle).toEqual(["t2", "t1", "t2"]);
  });

  test("mendeteksi siklus 3 node (A -> B, B -> C, C -> A)", () => {
    const edges = [
      { from: "t1", to: "t2" },
      { from: "t2", to: "t3" },
    ];
    const cycle = detectCycle(edges, { from: "t3", to: "t1" });
    expect(cycle).toEqual(["t3", "t1", "t2", "t3"]);
  });

  test("mengizinkan edge baru pada DAG yang valid (tanpa siklus)", () => {
    const edges = [
      { from: "t1", to: "t2" },
      { from: "t2", to: "t3" },
    ];
    const cycle = detectCycle(edges, { from: "t1", to: "t3" });
    expect(cycle).toBeNull();
  });

  test("diamondDAG (A->B, A->C, B->D, C->D, D->E): tidak siklus", () => {
    const edges = [
      { from: "A", to: "B" },
      { from: "A", to: "C" },
      { from: "B", to: "D" },
      { from: "C", to: "D" },
    ];
    const cycle = detectCycle(edges, { from: "D", to: "E" });
    expect(cycle).toBeNull();
  });

  test("graph tanpa edge: edge baru selalu aman", () => {
    const cycle = detectCycle([], { from: "x", to: "y" });
    expect(cycle).toBeNull();
  });

  test("mengembalikan path siklus yang valid (public_id) jika idToPublicId tersedia", () => {
    const edges = [{ from: "id1", to: "id2" }];
    const idToPublicId = { id1: "pub1", id2: "pub2" };
    const cycle = detectCycle(edges, { from: "id2", to: "id1" }, idToPublicId);
    expect(cycle).toEqual(["pub2", "pub1", "pub2"]);
  });
});
