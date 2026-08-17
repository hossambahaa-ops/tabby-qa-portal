import { describe, it, expect } from "vitest";
import { parseTargets, safeJson, safeJsonArr } from "../src/lib/actionPlan.js";
const obj = { follow_up_mode: "weekly", metrics: [{ kpi_key: "occupancy", target_value: 95 }] };
describe("jsonb decode tolerance", () => {
  it("parses the client's double-encoded string form", () => {
    expect(parseTargets(JSON.stringify(obj)).metrics).toHaveLength(1);
  });
  it("parses the RPC's real jsonb object form", () => {
    expect(parseTargets(obj).metrics).toHaveLength(1);
  });
  it("still handles the legacy bare array", () => {
    expect(parseTargets(JSON.stringify(obj.metrics)).metrics).toHaveLength(1);
    expect(parseTargets(obj.metrics).metrics).toHaveLength(1);
  });
  it("degrades safely", () => {
    expect(parseTargets(null).metrics).toEqual([]);
    expect(parseTargets("not json").metrics).toEqual([]);
  });
  it("safeJson/safeJsonArr accept both forms", () => {
    expect(safeJson('{"occupancy":95}')).toEqual({ occupancy: 95 });
    expect(safeJson({ occupancy: 95 })).toEqual({ occupancy: 95 });
    expect(safeJsonArr("[1,2]")).toEqual([1, 2]);
    expect(safeJsonArr([1, 2])).toEqual([1, 2]);
    expect(safeJsonArr({ a: 1 })).toEqual([]);
  });
});
